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

import { RAID_BOSS_BG, RAID_LOCATION_BG, ENEMY_IMG_BASE } from '@/lib/bossRaids'
import { CORSAIRS_RECKONING, CAPTAIN_KRUST, THE_CARTOGRAPHER, THE_TOLLMASTER, THE_COFFERS_FLEET, THE_QUARTERMASTER, THE_QUARTERMASTERS_GHOST, THE_BLOCKADE, THE_THRONE, THE_SUNKEN_HAND, GEM_GLYPH, raidCompletionBonusXp, type RaidLootItem, type BossRaidConfig } from '@/lib/bossRaids'
import { SIXTH_BERTH_COST, ARMORY_EXPANSION_COST, SPOILS_PRICE } from '@/lib/shipBerth'
import type { RaidMuster, MusterReport } from '@/lib/crewMuster'
import { CORSAIRS_RECKONING_CHALLENGE, CAPTAIN_KRUST_CHALLENGE, THE_CARTOGRAPHER_CHALLENGE, THE_TOLLMASTER_CHALLENGE, THE_COFFERS_FLEET_CHALLENGE, THE_QUARTERMASTER_CHALLENGE, THE_BLOCKADE_CHALLENGE, THE_THRONE_CHALLENGE, THE_SUNKEN_HAND_CHALLENGE } from '@/lib/raidChallenge'
import { getShipSkin, hullDropImage } from '@/lib/shipSkins'
import { ALL_RAIDS } from '@/lib/raidRegistry'
import { RAID_ITEMS } from '@/lib/raidItems'
import { SPECIAL_ITEMS } from '@/lib/specialItems'
import { getRaidItem } from '@/lib/raidItems'

// Legendary-crew card art, reused as a StoryScene bust so the chapter guides
// (Mako/Dole/Laz/Mira) can appear in cutscenes. Card art now; swap to
// transparent busts later by pointing these at new files. See lib/legendaryUnlocks.
const CREW_ART = (f: string) => `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/card-arts/${f}`
const GUIDE = {
  // OG crew. Always aboard, no unlock. They open the story and mentor.
  doby: { speaker: 'Doby', portrait: CREW_ART('Doby_Mick_v2.png') },
  kat:  { speaker: 'Kat',  portrait: CREW_ART('Catfish.png') },
  // The legendaries who join one per chapter.
  mako: { speaker: 'Mako', portrait: CREW_ART('Mako_Shark.png') },
  dole: { speaker: 'Dole', portrait: CREW_ART('Dole.png') },
  laz:  { speaker: 'Laz',  portrait: CREW_ART('Coelacanth.png') },
  mira: { speaker: 'Mira', portrait: CREW_ART('Mira.png') },
  // Not crew. The rival off the fishing dock, who turns out to be the name at
  // the top of all of it. His plate uses his OWN character sprite (the same one
  // the Ch IV silhouette and the reveal shot are cut from), so the face on the
  // plate is the face a fishing player has been trading barbs with all along.
  // Purpose-cropped from his fishing sprite: the dangling line and the ~425px
  // of dead sky above his head are cut, so he frames like the crew's busts
  // instead of sitting tiny in a mostly-empty box.
  finn: { speaker: 'Finn', portrait: '/finn_portrait.png' },
  // AFTER the transformation. Same name on the plate, because he is still Finn
  // and that is the horror of it, but the face is the thing that stood up. Using
  // the dock-hand portrait for his closing lines would have quietly undone the
  // beat that just played. The FULL piece, uncropped, so the plate shows the
  // whole thing he became rather than just its head.
  finnFinal: { speaker: 'Finn', portrait: '/finn_final.png' },
} as const

// A muster plays as a cutscene, not a static checklist: the crew read the
// manifest back and tick it off. Dole leads (the numbers/ledger hand), Doby
// judges seasoning, Mira/Kat close it out. Built LIVE from the musterReport so
// each line names the actual hands that answer (or the hole that doesn't).
export function musterSceneLines(nodeId: string, report: MusterReport): SceneLine[] {
  const isLast = nodeId === 'the_last_muster'
  const lines: SceneLine[] = []

  // Opening + framing — deliberately different between the two musters. The
  // Blockade is a clerk skimming for useful hands before Sal; the Last Muster is
  // the final door before the Don, where the whole point is a FULL crew.
  if (isLast) {
    lines.push({ text: 'The Gnash holds the last aisle before the throne. He does not speak. He counts the deck, then counts it again.' })
    lines.push({ ...GUIDE.dole, text: "Same manifest as the last door. Only this time it's the don behind it, and his whole court with him." })
    lines.push({ ...GUIDE.laz, text: "Every seat filled, or we turn around in this water. I've done the other thing." })
  } else {
    lines.push({ text: "Sal Brackwater's clerk comes alongside with a wet ledger and counts your crew like livestock. He is not looking for guns. Dole leans over his shoulder and reads it back, ticking each hand as he goes." })
    lines.push({ ...GUIDE.dole, text: 'He wants hands that can DO something when the shooting starts. Sal will take your hull in his teeth and roll, and the only thing that stops that is a crew who can get between you and the blow.' })
  }

  report.rows.forEach((row, i) => {
    if (i === 0) {
      // Crew count.
      lines.push(row.ok
        ? { ...GUIDE.dole, text: isLast
            ? `Hands at the rail. ${row.met.join(', ')}. A full bench, every berth crewed. It's the one thing the don doesn't expect, and the only thing that beats him.`
            : `Hands at the rail. ${row.met.join(', ')}. That's a crew. Tick.` }
        : { ...GUIDE.dole, text: isLast
            ? `The bench is thin. Only ${row.met.length} standing. Against the don, an empty berth is a hole in your line, and he doesn't miss holes.`
            : `The rail is thin. Only ${row.met.length} standing, and the throne wants more hands than that.` })
    } else if (i === 1) {
      // Seasoning.
      lines.push(row.ok
        ? { ...GUIDE.doby, text: 'Not a green hand among them. Every one has real sea under the keel.' }
        : { ...GUIDE.doby, text: `Some of these are still wet behind the fins. ${row.met.join('; ')}. The don finds the soft ones first.` })
    } else {
      // A required answer (one of the Don's / Sal's phases).
      const ask = row.label.replace(/^Someone who can /, '')
      lines.push(row.ok
        ? { ...GUIDE.dole, text: `${ask}? ${row.met.join(', ')}. Aye. Tick.` }
        : { ...GUIDE.dole, text: isLast
            ? `${ask}? ...No one on this deck. That's one thing the don can do that nobody aboard can answer, captain. He'll find it, and he'll end you on it.`
            : `${ask}? ...No one on this deck. A hole in the line Sal will roll straight through.` })
    }
  })

  if (report.passed) {
    if (isLast) {
      lines.push({ ...GUIDE.dole, text: 'Every berth crewed. Every gap closed. This is the crew that takes a don.' })
      lines.push({ ...GUIDE.mira, text: 'All of us against the biggest mark in the sea. Open it.' })
    } else {
      lines.push({ ...GUIDE.dole, text: 'Every line answered. A full, ugly, dangerous crew, and every hand can DO something when the guns start. The clerk has no cause to send us home.' })
      lines.push({ ...GUIDE.mira, text: 'Then stop admiring your own handwriting and wave us through.' })
    }
  } else {
    if (isLast) {
      lines.push({ ...GUIDE.dole, text: "The bench is short a hand, captain, and against the don a missing hand is a hole he'll find. The Gnash won't open the door, and I wouldn't walk you through it if he did." })
      lines.push({ ...GUIDE.kat, text: "This is the one fight in the whole sea you don't enter a hand short. Fill the berth from Manage Crew, then come back and we read it again." })
    } else {
      lines.push({ ...GUIDE.dole, text: "The manifest is short a hand. The clerk won't pass a half-answered deck." })
      lines.push({ ...GUIDE.kat, text: "Better we find the gap here than on Sal's teeth. Go and fill it, captain." })
    }
  }
  return lines
}

// Each type gets its own color + glyph on the map:
//  - skirmish  : a single practice battle
//  - raid      : a full multi-encounter campaign / boss
//  - milestone : a "collect / hold X" goal (no fight)
//  - shop      : a contraband stall (future)
//  - story     : an overarching-story beat (future)
export type RaidNodeType = 'skirmish' | 'raid' | 'milestone' | 'shop' | 'story' | 'puzzle' | 'class_pick' | 'event' | 'dice' | 'gauntlet' | 'fork' | 'dps_check' | 'berth' | 'muster' | 'spoils'

// Branching event nodes (lib/raidMap RaidNode.event). One-time, the
// player picks ONE option which fires its outcome and clears the node;
// the other options are gone for good. Distinct from `choice` (which
// picks from raid items only) because each option here can grant a
// different KIND of reward, including "nothing." Used for in-world
// decision beats. Captured scouts, faction parlays, etc.
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
// guessing useless). That is what makes it genuinely hard. There is no hidden
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
  /** A locked maze mirror the player CANNOT rotate. Pure structure the beam
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
   *  Multiple lenses force a threaded route. No single obvious trace. */
  targets: { x: number; y: number }[]
  /** Solid pillars the beam dies against (also just maze dressing). */
  walls: { x: number; y: number }[]
  /** Prism tiles. A beam that enters SPLITS into the two perpendicular
   *  directions (both branches travel on, both can light lenses). Turns the
   *  single line into a branching tree so it can't be traced at a glance. */
  prisms?: { x: number; y: number }[]
  /** Rotatable mirror tiles. */
  mirrors: RaidMirrorTile[]
  /** "Par". How many fires the player gets to light the lens. Burning them all
   *  without a hit resets the mirrors to their start (planning beats guessing).
   *  Omit for unlimited. */
  fireBudget?: number
}

// Cargo Shuffle (Ch4). Sokoban. Push powder crates onto their deck marks;
// crates only PUSH (never pull), one at a time. Classic notation per row:
// '#' wall · ' ' floor · '@' sailor · '$' crate · '.' mark · '*' crate on
// mark · '+' sailor on mark. Every room MUST be validated with
// web/verify-cargo.mjs (BFS: solvable + min moves vs budget) before shipping.
export interface RaidCargoRoom {
  grid: string[]
  /** Move budget (steps, pushes included). Busting it resets the room, *  planning beats brute-forcing, same philosophy as Mirror Run's fires. */
  moveBudget: number
}
export interface RaidCargoPuzzle { rooms: RaidCargoRoom[] }

// Tumbler Lock (Ch4). Rush Hour. Slide iron bars along their axis until the
// gold BOLT can run out the right edge of its row. Notation per row: '.'
// empty, letters = bars (contiguous h or v), 'Z' = the bolt (horizontal).
// One SLIDE = one bar moved any distance. Every stage MUST be validated with
// web/verify-tumbler.mjs (BFS: solvable + min slides vs budget).
export interface RaidTumblerStage {
  grid: string[]
  /** Slide budget. Busting it resets the stage. */
  moveBudget: number
}
export interface RaidTumblerPuzzle { stages: RaidTumblerStage[] }

export interface RaidPuzzle {
  /** Which puzzle engine renders this node. 'beacon' = Lights Out (default,
   *  back-compat for the existing smuggler's-chart node). 'cipher' = the
   *  coupled wax dials (turn one, its neighbours turn too; line every seal
   *  to the index at once). 'mirror' = the light-beam redirection grid.
   *  'cargo' = Sokoban crate-pushing (Ch4). */
  kind?: 'beacon' | 'cipher' | 'mirror' | 'cargo' | 'tumbler'
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
  /** cargo: the Sokoban rooms (played in order; solving the last solves the node). */
  cargo?: RaidCargoPuzzle
  /** tumbler: the Rush-Hour stages (played in order; the last solve clears the node). */
  tumbler?: RaidTumblerPuzzle
  /** Nav XP granted on solve (no doubloons. This is a navigation discovery). */
  rewardNavXp: number
  /** Story payoff shown the moment the puzzle resolves: where the freight runs,
   *  i.e. the next place to head. Supports \n line breaks. */
  reveal?: string
}

// ── Bones (a d20 skill-check / risk-reward node) ─────────────────────────────
// A D&D-style throw: the player picks ONE approach, the server rolls a d20 and
// adds a small Navigation bonus, and the total vs the option's DC decides win or
// miss. One-time. Risk/reward is baked per option. A safe option always pays
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
// First new map structure since Ch2. Adds agency + replay.
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
// A `dps_check` node is a coin-or-stats gate. The player either PAYS `payCost`
// to skip it, or FIRES one shot: the server rolls a straight (non-critical) hit
// from the player's real damage profile (ship + power + gear) and compares it to
// `threshold`. Meet it and you pass free; fall short and you owe `failCost`.
// No aiming. The roll is bounded by your stats, so it's a gear check with a
// coin fallback. `threshold` is tuned for a non-crit hit (lower than a crit).
export interface RaidDpsCheck {
  /** Single-shot (non-crit) damage you must MEET OR BEAT to pass free. */
  threshold: number
  /** Doubloons to skip the check outright (the safe option). */
  payCost: number
  /** Doubloons owed if you take the shot and fall short of the threshold. */
  failCost: number
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
// instead of prose walls. Players read ten-word speech lines, they skip
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
  /**
   * The line. Wrap a word or phrase in *asterisks* to hit it. It renders in the
   * scene accent, so a writer can put weight on a word instead of hoping the reader
   * finds it.
   */
  text: string
  /** ── DIRECTION (all optional; a scene with none of it still plays) ──────────
   *  A held beat, in ms, BEFORE this line starts typing. Silence is a tool: it is
   *  the difference between a reveal and a sentence. */
  pause?: number
  /** A hit on this line. 'shake' rocks the frame, 'flash' blows it out for a beat. */
  fx?: 'shake' | 'flash'
  /** CLOSE-UP: the speaking bust fills the frame for this line (a big emotional
   *  beat). Ignored on narrator lines with no cast. */
  closeup?: boolean
  /** INSERT SHOT: a stylized object the frame pushes into on this line (the cast
   *  steps aside). For the marquee reveals. The F in the margin, a sealed
   *  letter. The narrator text still rides the plate below it. */
  insert?: SceneInsert
  /** BACKDROP CHANGE from this line on. A node normally paints one backdrop for
   *  its whole scene (SCENE_BACKDROPS), which is right for a scene that stays
   *  in one place. The two Finn scenes do not: the morning is calm, then it is
   *  a harvest, then it is dark, and the closer goes from wreckage to flat
   *  water. Set this on the line where the world changes and it holds until
   *  another line changes it again. */
  backdrop?: string
}

/** A stylized object beat (rendered in CSS, no art). Extend the union +
 *  the InsertShot switch in components/cutscene.tsx to add new ones. */
export type SceneInsert =
  | { kind: 'ledger-f' }                 // the patient F signing the margin
  | { kind: 'sealed-letter'; wax?: string } // a wax-sealed letter (wax = the initials pressed in it)
  | { kind: 'finn-silhouette' }          // a figure rising from the true deep. Finn's shape, blacked to a silhouette (the "not the final boss" sting; reuses his CharacterAvatar, no art)
  | { kind: 'finn-unmasked' }            // THE reveal: the same shape and stance, finally lit. The black drains out of him (no new art; pairs with finn-silhouette)
  | { kind: 'ancient-harvest' }          // the six Ancient Deep giants arrayed and DRAINED, their power pulled to the middle. The engine of Finn's transformation (existing catalogue art)
  | { kind: 'finn-becoming' }            // the WARP: he shudders, drains to a silhouette, swells past his old size, cracks open with light and blows out to white. Hands off to finn-sinister
  | { kind: 'finn-sinister' }            // THE turn: the dock-hand costume comes off and his true form stands up. Uses bespoke art (FINN_SINISTER_ART); falls back to his darkened sprite until that art lands
  | { kind: 'finn-undone' }              // THE END: his hull goes over, the swell collapses, the light runs OUT through the cracks and the six leave as ash. The mirror of finn-becoming
  | { kind: 'finn-remains' }             // AFTER the undoing: the borrowed power gone, the dock angler back in his little boat, fading out where the monster shattered
  | { kind: 'dial-demo' }                // a live catch-dial demo (needle landing green→gold). Rendered by a caller's renderInsert override (the fishing intro), not the shared InsertShot.

/** One row in a node's "possible drops" panel. */
export interface RaidNodeDrop {
  /** The loot id, so a live sheet can match this row against what the player owns.
   *  Needed by uniqueShare raids, where the printed odds depend on your inventory. */
  id?: string
  label: string
  emoji: string
  image?: string | null
  /** CSS filter applied to `image` (ship-skin previews recolor a ship sprite). */
  imageFilter?: string
  rarity?: RaidLootItem['rarity']
  /** Human-readable odds, e.g. "49%", "Guaranteed", "Every kill". */
  chance?: string
  /** Short, noob-friendly line under the label (what the thing is). */
  sublabel?: string
  /** Solid swatch color shown instead of an icon (ship skins). */
  swatch?: string
  /** CSS filter applied to the swatch (the skin's actual effect). */
  swatchFilter?: string
  /** If this drop is a raid item, its id (so the detail modal can pull
   *  the full RaidItemDef. Effects, description, source). */
  raidItemId?: string
  /** If this drop is a FISHING special (Finn's Eye), its id. Specials live in
   *  their own registry, so without this the detail modal has nothing to read
   *  and renders a nameless, effectless card. */
  specialItemId?: string
  /** If this drop is a ship skin, its id (so the detail modal can
   *  pull the full ShipSkin. Name, filter, lore). */
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
  /** Optional SECOND node gate, independent of the chain. `requiresNode` places a
   *  node in the chapter chain; this gates it on something off that chain (the
   *  Quartermaster's Ghost sits in Chapter IV but only opens once you have put the
   *  Quartermaster down in his CHALLENGE run). Both must be cleared. */
  requiresClearedNode?: string
  /** This node's own words for its `requiresClearedNode` gate, used instead of
   *  the sentence built from that node's label.
   *
   *  The derived sentence is "Clear <label> first", which only helps when the
   *  player can go and find a card by that name. CHALLENGE variants are filtered
   *  off the map spine on purpose (the boss's own Normal/Challenge switch is
   *  meant to be the single door), so for the Quartermaster's Ghost it read
   *  "Clear Challenge: The Quartermaster first" and named a destination that
   *  does not visibly exist. A player who already knew where Challenge mode
   *  lived was fine; everyone else was hunting a card that was never drawn.
   *
   *  Only the off-chain gate takes an override. `requiresNode` always points at
   *  a card on this map, so its sentence can never have this problem. */
  gateLockNote?: string
  /** Locked, but still OPENABLE. A locked node is normally inert: tapping it does
   *  nothing and its sheet never opens. That is right for the story chain, where a
   *  locked node is just the next thing you have not reached. It is wrong for a node
   *  whose whole job is to be a GOAL, because hiding what it holds also hides the
   *  reason to go and earn it. Set this and the token stays tappable while locked:
   *  the sheet opens, shows the wares, and says plainly what stands in the way.
   *  Entering is still refused (the CTA reads Locked, and the route re-checks the
   *  gate server-side). */
  previewWhenLocked?: boolean
  /** Show this boss's face and NAME before they are beaten. Bosses are masked
   *  (silhouette + "???") until cleared, which is right when the fight is the
   *  introduction. It is wrong when the STORY has already introduced them: for
   *  Finn the node right before this one is the reveal, so masking him after it
   *  un-tells the twist the player just watched. */
  revealBoss?: boolean
  /** Reveal this boss's face + name ONLY once `revealBossAfter` (a node id) is
   *  cleared. The unconditional `revealBoss` is wrong for a boss whose identity
   *  IS the twist: previewWhenLocked shows the node long before the reveal
   *  scene, and the Bosses tab lists it regardless, so a flat `true` showed
   *  Finn's face and name to players who had not met him yet. */
  revealBossAfter?: string
  /** Optional extra gate: minimum Navigation level. */
  requiresNavLevel?: number
  /** Optional extra gate: how many Ancient Deep giants you must have landed
   *  (profiles.ancient_catches). THE cross-track bridge — the one gate that
   *  makes the fishing arc and the raid arc mechanically inseparable, so the
   *  last stop cannot be reached by a captain who never went down for the
   *  giants. Enforced here for the map AND server-side on the route. */
  requiresAncients?: number
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
  /** Berth nodes: a one-time permanent CREW SLOT refit (Man-o-War 5 -> 6) for
   *  `price` doubloons. Clears on read (like the vault) so it never gates the
   *  chain; the purchase itself stays available on every revisit. */
  berth?: { price: number }
  /** Armory refit nodes: a one-time permanent extra RAID-ITEM MOUNT for
   *  `price` doubloons. Same berth-node mechanics (clears on read, purchase
   *  lives in Manage Ship), just for item slots instead of a crew slot. */
  armory?: { price: number }
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
   *  the picker writes into profiles.ship_classes[chapterId]).
   *  `options` overrides the normal tall-vs-wide class ladder with an
   *  EXACT menu (the Ch4 augment offers Expanded Armory vs Expanded
   *  Quarters instead of the class lines). */
  classPick?: { chapterId: string; options?: string[] }
  /** puzzle: the beacon-chain (Lights Out) or cipher dials. Solving clears it. */
  puzzle?: RaidPuzzle
  /** dice: a d20 skill-check / risk-reward throw. Picking + rolling clears it. */
  dice?: RaidDice
  /** fork: a two-route branch. Picking a route records the choice + clears it. */
  fork?: RaidFork
  /** dps_check: a coin-or-skill gate (pay to skip, or one aim-bar shot). */
  dpsCheck?: RaidDpsCheck
  /** muster: a ROSTER gate. The don's men look over your raid crew and decide
   *  whether you are worth letting near the line. See lib/crewMuster: it checks
   *  bodies, levels, and whether you actually brought crew who CAN answer a
   *  mechanic check. It never asks you to use an ability, only to have packed one. */
  muster?: RaidMuster
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
  /** THE SPOILS OF THE SUNKEN HAND. A two-way choice where you take ONE side
   *  free and may buy the other later. Both sides open a slot that accepts
   *  exactly ONE item, Finn's matching drop, so neither is a general-purpose
   *  expansion and neither can be farmed. `price` is the cost of the side you
   *  did NOT take. */
  spoils?: { price: number }
  /** Tap-through dialogue scene. On story nodes the Continue CTA plays
   *  it and the final tap marks the node read. On milestone/event nodes
   *  it's an INTRO cutscene: the sheet gates the interactive bits (pay
   *  bar / choice cards) behind a first watch, and the node's own
   *  claim/choice action stays the clear. The scene itself never
   *  writes to the server. When present, the sheet shows flavor as the
   *  pre-watch teaser and detail.summary once cleared; the prose
   *  description becomes archive/fallback text. Cleared nodes offer a
   *  replay. */
  scene?: SceneLine[]
  /**
   * The scene's color temperature. Everything was gold, so a betrayal, a joke and a
   * death all wore the same face. Crimson for a turn, sick green for the Gullet, bone
   * white for the thing on the bar. Defaults to gold when a scene does not care.
   */
  sceneAccent?: string
  /** Rich detail surfaced in the tap-to-open sheet. */
  detail: RaidNodeDetail
}

// Ship-skin loot previews recolor this ship sprite (the tier-4 brigantine) so
// players see the skin on an actual hull rather than a flat color chip.
const SHIP_SKIN_PREVIEW_IMG = '/models/brigantine_v2.png'

/** Derive a drop list (with rolled-once odds) from a boss raid's loot
 *  table so the node sheet and the live crate never drift apart.
 *  Doubloons entries skip the % chip. The % feels transactional for
 *  currency and only really tells the player "you'll probably get gold",
 *  which they already assume. The chip stays on items / skins / packs
 *  where the rarity actually matters to the player's chase decision. */
/** Format a 0-1 share as a drop-chance label. Whole numbers print whole; a
 *  fractional rate keeps ONE decimal, because Math.round turns a genuine 2.5%
 *  into a printed 3% and the card would be quoting odds the roll never uses. */
export function formatDropChance(share: number): string {
  const pct = share * 100
  const rounded = Math.round(pct * 10) / 10
  return Number.isInteger(rounded) ? rounded + '%' : rounded.toFixed(1) + '%'
}
function lootDrops(loot: RaidLootItem[]): RaidNodeDrop[] {
  const total = loot.reduce((s, l) => s + l.weight, 0)
  const drops = loot.map(l => {
    const isDoubloons = l.id.startsWith('doubloons_')
    const drop: RaidNodeDrop = {
      id: l.id,
      label: l.label,
      emoji: l.emoji,
      // Fall back to the ITEM's own art. A loot row duplicates the sprite path, so a
      // raid item that gets art later leaves its loot row on `image: null` and quietly
      // renders a crate icon in the drops list forever (both racks did exactly that).
      // The item registry is the one source of truth; the loot row only overrides it.
      image: l.image ?? getRaidItem(l.id)?.image ?? null,
      rarity: l.rarity,
      ...(isDoubloons ? {} : { chance: formatDropChance(l.weight / total) }),
    }
    // Ship skin → preview the skin on a ship sprite (recolored brigantine) so
    // the player sees what it actually looks like, not just a flat color.
    if (l.shipSkinId) {
      const skin = getShipSkin(l.shipSkinId)
      if (skin) {
        drop.label = skin.name
        drop.sublabel = 'Ship skin. A cosmetic new look for your ship.'
        // Most skins recolor via a bespoke sprite (imageByTier), not a CSS
        // filter. Preview that sprite (the recolored brigantine) so the drop
        // shows the skin's real look, not the base hull. Filter-only skins fall
        // back to the base preview image + their filter.
        // Trimmed to the ship itself: a drop tile is 60px tall and the raw
        // sprite is mostly transparent canvas around an off-centre hull.
        drop.image = hullDropImage(skin.imageByTier?.[4] ?? SHIP_SKIN_PREVIEW_IMG)
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
    // Fishing special (The Primeval Eye). Neither a raid item nor a skin, so
    // without this branch it falls through both and reads as a bare label with
    // no effect text at all.
    const special = SPECIAL_ITEMS.find(x => x.id === l.id)
    if (special) {
      drop.label = special.name
      drop.sublabel = `Fishing special. ${special.description}`
      drop.specialItemId = special.id
      drop.image = drop.image ?? special.image ?? null
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
 *  boundary. The boundary is given by lastNodeId. Walking RAID_MAP
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
  /** A CODA, not a numbered chapter. Buckets its nodes apart from the chapter
   *  before it (so the finale isn't swallowed into Chapter IV) while rendering
   *  as a bare title — no "Chapter V" anywhere. One Last Ride is one node, not
   *  an act. */
  coda?: boolean
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
    // final beat. A permanent ship-identity decision for clearing
    // the chapter.
    lastNodeId: 'chapter_1_class',
  },
  {
    id:         'sunken_hand',
    number:     2,
    romanNumeral: 'II',
    title:      'A Bigger Fish',
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
    // coffers_heading → coffers_fork → coffers_fleet (Raid 5) →
    // quartermaster_turn (the Cache betrayal) → the_quartermaster (Raid 6) →
    // chapter_3_close (names the don, then the crew's watch) → chapter_3_class.
    // LIVE since 2026-07-04 (adminOnly + route is_admin guards dropped).
    lastNodeId: 'chapter_3_class',
  },
  {
    id:         'the_last_fathom',
    number:     4,
    romanNumeral: 'IV',
    title:      'The Last Fathom',
    subtitle:   'The deepest water there is, and the don who owns it. Nothing waits past this.',
    // FULLY LIVE since 2026-07-19 (adminOnly flags + the /raids/throne and
    // /raids/throne/challenge is_admin guards all dropped together). Chain:
    // throne_heading → the_reclamation → Cargo Shuffle puzzle → Raid 7
    // (Sal Brackwater) → crooked_ledger → Tumbler Lock puzzle → Raid 8
    // (Don Finleone) → chapter_4_close (Between Watches) → chapter_4_augment.
    lastNodeId: 'chapter_4_augment',
  },
  {
    id:         'one_last_ride',
    number:     5,
    romanNumeral: '',          // a coda has no numeral; `coda` suppresses the label
    title:      'One Last Ride',
    subtitle:   'The don was never the top of it. Something has been waiting on you since the first cast.',
    coda:       true,
    lastNodeId: 'one_last_ride',
  },
]

/** Which chapter does this node belong to? Walks RAID_CHAPTERS in
 *  order and returns the first one whose lastNodeId comes at or after
 *  this node in RAID_MAP. Falls back to the last chapter if the node
 *  somehow sits past every boundary (defensive. Should never happen
 *  if RAID_CHAPTERS is kept in sync with RAID_MAP). */
export function chapterForNode(nodeId: string): RaidChapter {
  const nodeIdx = RAID_MAP.findIndex(n => n.id === nodeId)
  for (const c of RAID_CHAPTERS) {
    const lastIdx = RAID_MAP.findIndex(n => n.id === c.lastNodeId)
    if (nodeIdx >= 0 && nodeIdx <= lastIdx) return c
  }
  return RAID_CHAPTERS[RAID_CHAPTERS.length - 1]
}

/**
 * Painterly establishing backdrops behind a node's story scene, keyed by node id
 * (art in public/scenes). Soft, muted, dark-at-the-bottom so the dialogue plate and
 * character busts stay legible. Several places are reused across the beats that share
 * them. A node with no entry here plays on the plain dark gradient, exactly as before.
 * Edit freely, node by node.
 */
export const SCENE_BACKDROPS: Record<string, string> = {
  // Chapter I — the coast
  intro: '/scenes/reef-coast.jpg',
  syndicate: '/scenes/strongbox-deck.jpg',       // strongbox cracked, a fin in the wake
  bilge_milestone: '/scenes/cold-strait.jpg',
  krust_reveal: '/scenes/smugglers-cove.jpg',    // the Fence's hidden berth
  chapter_1_close: '/scenes/deck-night.jpg',
  // Chapter II — the strait and the Gullet
  finndicate_notice: '/scenes/chart-table.jpg',  // the order-paper on the chart table
  cartographer_reveal: '/scenes/cold-strait.jpg',
  gullet_heading: '/scenes/the-gullet.jpg',
  gullet_bones: '/scenes/wrecked-freighter.jpg', // the snagged freighter
  scout_debt: '/scenes/gullet-mouth-fog.jpg',    // the fog at the mouth
  chapter_2_close: '/scenes/deck-night-2.jpg',   // moonlit deck variant
  // Chapter III — the Coffers
  coffers_heading: '/scenes/drowned-market.jpg',
  coffers_keeper: '/scenes/quartermaster-cache.jpg',
  quartermaster_turn: '/scenes/quartermaster-cache.jpg',
  coffers_strongbox: '/scenes/counting-house.jpg',
  coffers_ledger: '/scenes/vault-shelves.jpg',
  chapter_3_close: '/scenes/deck-dawn.jpg',      // pre-dawn deck variant
  // Chapter IV — the last fathom
  throne_heading: '/scenes/last-fathom.jpg',
  blockade_muster: '/scenes/last-fathom.jpg',
  thing_on_the_bar: '/scenes/thing-on-the-bar.jpg',
  crooked_ledger: '/scenes/sal-strongroom.jpg',  // ledgers stacked to the beam
  the_drowned_court: '/scenes/drowned-court.jpg',
  the_last_muster: '/scenes/drowned-court.jpg',
  within_hail: '/scenes/the-throne.jpg',         // Don's flagship looming close
  chapter_4_close: '/scenes/deck-night.jpg',
  // The finale. Both scenes CHANGE backdrop partway through (see SceneLine.backdrop);
  // these are only where each one opens.
  the_hand_that_sharpens: '/scenes/quiet-water.jpg',  // a morning too still to trust
  the_long_quiet: '/scenes/hull-under.jpg',           // his keel rolling clear of the water
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
      { ...GUIDE.doby, text: "Every reef on this coast has gone quiet, small fry. And a quiet sea is a sea with something wrong in it." },
      { text: "Barnacle Pete robs the small and the slow. Has done for years, all up and down this coast." },
      { text: "Little crews. Fishing folk. The odd unlucky angler. Anyone too small to swing back." },
      { ...GUIDE.kat, text: "And here's the part that never sat right with me. Pete steals a fortune and stays poor as a barnacle." },
      { speaker: 'A Passing Sailor', text: "Pete don't spend his haul. He delivers it." },
      { text: "Said once, by a sailor who never said it again." },
      { text: "The rest sails off to *someone Pete would rather you never asked about*. So nobody asks.", pause: 700 },
      { ...GUIDE.doby, text: "You've got a boat, a free afternoon, and no manners worth mentioning. Kat and I have sailed with worse. We're with you." },
      { speaker: 'Barnacle Pete', portrait: CORSAIRS_RECKONING.enemies.pete.portrait, text: "Broke, me? Couldn't rob a rockpool. Now mind yer business, guppy." },
      { ...GUIDE.kat, text: "Charming sort. Go shake him till the truth falls out of his coat. But do it clever, not bare-knuckled." },
      { ...GUIDE.kat, text: "A ship is only as strong as her hull and her hands. Upgrade the ship when the coin allows, and sign on crew at the Crew Hall. A full deck wins the fights a lone captain loses." },
      { ...GUIDE.doby, text: "Then point us at the reef. Time Pete's Raiders learned who they picked a fight with." },
    ],
    detail: {
      description:
        "Pete's no broke old chancer. He's good at exactly one thing: picking on anyone too small to swing back. Little crews, fishing folk, the odd unlucky angler. Years of it up and down this coast, and somehow he's not a coin richer for it.\n\nThat's the funny part. Pete steals a fortune and keeps about a copper. The rest sails off to someone he'd rather you never asked about, so nobody asks. You've got a boat, a free afternoon, and no manners worth mentioning. Go shake the loudest pirate on the water and see what falls out of his coat.",
      drops: [
        {
          emoji: '📜',
          label: "Captain's Logbook, Fragment I",
          sublabel: "\"Pete don't spend his haul. He delivers it.\" Said once, by a sailor who never said it again.",
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
        // Single combined-reward line. Skirmish is "kill a raider, get
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
    // Challenge variant. Unlocks once normal Pete is cleared. Same gauntlet,
    // scaled-up stats (+30% mob HP, +15% mob dmg, +50% boss HP, +20% boss
    // dmg) and scaled payouts (+50% gold/XP per kill, +50% gem weight in
    // the crate, DOUBLE the unique drop rate). Completions track under the
    // suffixed raid_id so the Boss Records leaderboard is its own bucket.
    // The "syndicate" story chain still gates on the normal pete clear,
    // not this one. Challenge stays optional / parallel to the main line.
    id: 'pete_challenge',
    type: 'raid',
    label: "Challenge: The Corsair's Reckoning",
    flavor: "Pete sails out again, meaner this time, with the kind of crew that doesn't lose twice.",
    requiresNode: 'pete',
    route: '/raids/challenge',
    raidId: CORSAIRS_RECKONING_CHALLENGE.raidId,
    sideBranch: { parentId: 'pete' },
    // Same boss portrait as the parent raid. The side-branch token paints
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
    label: 'Up the Line',
    flavor: "Pete's books all point the same way and name the Finndicate. One sealed letter points further still, at somebody else.",
    bridge: "The letter's heading runs straight through the Bilge Strait. Want C.K.'s cargo? First you slip past the thugs who own that water.",
    requiresNode: 'pete',
    image: '/raidlog.png',
    scene: [
      { text: "Pete's strongbox cracks open at last. No fortune inside. Only paperwork." },
      { text: "Cut sheets. Courier routes. Years of neat little sums." },
      { text: "And one word stamped on every page: *the Finndicate*.", pause: 800 },
      { speaker: 'Barnacle Pete', portrait: CORSAIRS_RECKONING.enemies.pete.portrait, text: "You think I keep the coin? Not a copper of it stays with me. Never has." },
      { ...GUIDE.kat, text: "So much for the kingpin. All that noise, and he was only ever another hand passing the plate up the line. Squeezed dry and tossed back, same as everyone he ever robbed." },
      { ...GUIDE.doby, text: "The Finndicate. I've heard that name whispered in deep water, and never once by anything that lived to say it twice." },
      { text: "And the coin never sits still. Page after page, every haul buys the same thing over and over, and not one line says what." },
      { text: "Under the ledgers there's a sealed letter. No name on it. Just two letters pressed into the wax: *C.K.*", pause: 700, insert: { kind: 'sealed-letter', wax: 'C.K.' } },
      { text: "The route's mostly burned away, but the heading held. Out past the Bilge Strait, into the cold." },
      { text: "Whoever C.K. is, the Finndicate trusts them with cargo by the holdful. And now you know which way it sails." },
      { text: "A fin has been cutting your wake since the strongbox cracked. It closes the distance now, hungry and unbothered.", pause: 500 },
      { ...GUIDE.mako, text: "Bilge Strait, after one sealed letter. Most captains wouldn't sail that far on a hunch. Good thing neither of us is most captains." },
      { ...GUIDE.mako, text: "Mako. I don't waste myself in small water, and you just made yourself worth watching. Muster a crew and my name's on offer." },
      { text: "No handshake. Sharks don't. He drifts back into the deep, all teeth and appetite, a shape you could call on when the water turns mean." },
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
    sceneAccent: '#7dd3fc',
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
      { speaker: 'The Fence', text: "*Captain Krust*. And you never heard it here.", pause: 800 },
      { speaker: 'The Fence', portrait: CAPTAIN_KRUST.enemies.krust.portrait, text: "Old, leathery, and the Finndicate sets its clock by him. He moves their freight. All of it." },
      { speaker: 'The Fence', portrait: CAPTAIN_KRUST.enemies.krust.portrait, text: "Never once asked whose name's on a manifest. Stayed afloat a whole lifetime for exactly that reason." },
      { text: "Nothing like Pete, this one. He doesn't rob the small. He moves cargo, on time, in bulk." },
      { speaker: 'The Fence', text: "No kingpin, mind. Krust answers upward, same as every other fish in this sea." },
      { speaker: 'The Fence', text: "Take his cargo off him, captain. Do the trade a favor. I do enjoy watching a hungry captain find out how far up this thing goes." },
      { speaker: 'The Fence', text: "But C.K. don't lose cargo. Lose his cargo, and you find out why.", pause: 500 },
      { text: "A name at last. The Finndicate's freight has a face, and the face keeps a schedule." },
      { text: "His consignment's on the cold water right now." },
      { ...GUIDE.mako, text: "An old hauler who never asks whose name's on the box. He'll be slow, and he'll be certain. My two favorite things in a target." },
      { ...GUIDE.mako, text: "Sign me on for that run, and I'll be the part he doesn't see coming." },
    ],
    sceneAccent: '#7dd3fc',
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
    // node. See pete_challenge for the design notes. Gates on the normal
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
    // Chapter I closer. "Between Watches". The recurring denouement beat: after
    // the chapter boss, the crew takes a quiet watch together before the Captain's
    // Choice. Grows richer each chapter as more hands join. Ends on MOOD, never a
    // plot noun (the next reveal belongs to the next chapter's opener). Gates the
    // class pick so it always plays first.
    id: 'chapter_1_close',
    type: 'story',
    label: 'Between Watches',
    flavor: "Two captains under, and a rare quiet on the deck. Before the next heading, the crew takes a watch together.",
    bridge: "The rest never lasts. Somewhere past the dark water, the Finndicate has started asking who you are.",
    requiresNode: 'krust',
    image: '/raidlog.png',
    scene: [
      { text: "Krust's consignment burns to the waterline, and for the first time since the coast, the deck goes quiet." },
      { ...GUIDE.kat, text: "Sit. Eat something. You've been running on spite and seawater for a week." },
      { ...GUIDE.doby, text: "Let the captain stand, Kat. A hand who just put Captain Krust under has earned the view." },
      { ...GUIDE.mako, text: "That view being your name on every wanted board from here to the danger lines. You put us on the Finndicate's list today." },
      { ...GUIDE.mako, text: "For what it's worth, I've never eaten better than when something bigger was hunting me." },
      { ...GUIDE.kat, text: "That's the most encouraging thing you've ever said, and it terrifies me." },
      { text: "Somewhere past the dark water, something large stops what it is doing to look your way.", pause: 700 },
      { text: "But that is tomorrow's heading. Tonight the crew is whole, and the grog is cold." },
    ],
    detail: {
      description:
        "Pete and Krust both on the seabed, and the coast knows your sails now. Before the next heading the deck goes quiet: Kat patches the hull and the hands, Doby watches the dark water, and Mako grins at the wanted board with your name freshly on it. The Finndicate has noticed you. Tomorrow that will matter. Tonight the crew is whole.",
      ctaLabel: 'Rest a While →',
      summary: "With Pete and Krust both under, the crew took a quiet watch together before the next heading. The Finndicate has noticed you now, but tonight the deck is whole.",
    },
  },
  {
    // Chapter-end ship-class pick. Unlocks after the chapter closer (Between
    // Watches) plays. Picks a permanent ship identity from the 4-class roster in
    // lib/shipClasses.ts; locked in once chosen. New class nodes for future
    // chapters follow the same pattern (one per chapter, after the closer).
    id: 'chapter_1_class',
    type: 'class_pick',
    label: "Captain's Choice",
    flavor: "Two captains on the seabed and your name on every wanted board from here to the danger lines. Time to decide what kind of captain you want to be.",
    requiresNode: 'chapter_1_close',
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
    // Gate on the Ch I class pick (not the boss) so the Ch I closer + pick sit
    // BETWEEN this opener and Krust's death — otherwise chapter_1_close and this
    // node both unlock at once, an effective back-to-back story beat. Matches
    // how Ch II/III openers gate on their class pick.
    requiresNode: 'chapter_1_class',
    image: '/raidlog.png',
    scene: [
      { text: "Krust's consignment is still smoking when the answer comes back. Not a fleet, not a bounty. One scrap of order-paper, and the cold understanding that somebody well above the freight desk has finally set down the ledgers to look at you." },
      { ...GUIDE.mako, text: "There it is. You wanted the Finndicate to notice you. It noticed." },
      // Seeds Finn's "every door you kicked down, I left unlocked". Kat raises it,
      // nobody picks it up, and the scene moves on: luck on first read, a
      // confession on the second.
      { ...GUIDE.kat, text: "Does it strike anyone else that Krust's cabin was wide open? Charts on the table, the whole network still pinned out. That's twice now a lock nobody turned." },
      { ...GUIDE.mako, text: "That's called being good at this, Kat. Enjoy it." },
      { ...GUIDE.kat, text: "There's a difference between notice and this. Krust was a name. Whatever sets its books down to answer a name is the thing that stands over one." },
      { ...GUIDE.doby, text: "Then read it out. What does a thing that size want badly enough to put in writing?" },
      { speaker: 'A Finndicate Order', text: "Danger-zone consignment. Priority freight. It will not open for him. Find the hands that it will.", pause: 500 },
      { text: "A shape you hadn't logged is already at the chart table, turning the scrap to the light like he is pricing it.", pause: 400 },
      { ...GUIDE.dole, text: "Danger zones. Such a marvelous name. You only bother naming water that frightening when you're hiding something in it worth the fright." },
      { ...GUIDE.doby, text: "And who in the cold deep are you?" },
      { ...GUIDE.dole, text: "The navigator who read this before his tea went cold. Drowned captains couldn't. Dole. I know every current worth knowing and most of the ones that aren't." },
      { ...GUIDE.dole, text: "The cipher was never the hard part. It's who wrote it, and how much freight they'll feed that water to keep it moving. When you muster hands for the danger line, you could do worse than one who's already been there." },
      { ...GUIDE.mako, text: "Priority freight, worth every hull it eats. They're not shipping that. They're feeding it." },
      { text: "Dole sets the scrap down facing you, the heading already circled. You hadn't circled it.", pause: 400 },
    ],
    sceneAccent: '#a78bfa',
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
    // No per-node image. Every puzzle node defaults to /puzzle.png via
    // TYPE_IMAGE in RaidsSection. Override here only for a one-off art.
    puzzle: {
      // 4×4 Lights Out. Light every beacon at once; each tap flips the beacon and
      // its neighbours, so there is no greedy solve. 4×4 is fully solvable with a
      // unique solution (no quiet patterns). A real puzzle that isn't a wall.
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
    // the cargo + the cut of the ship. Keeps the one-noun-per-story-
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
    // not zero, but no mechanic backs it yet. Wire when ready.
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
      { text: "The choice is yours. Pick *once, and only once*.", pause: 600 },
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
        "Two cutters running tight together, no flag flying and neither one a freight ship. They were sounding the water ahead of you, no question, the same water the smuggler's chart pointed past. You catch them clean.\n\nThe scouts won't tell you who they sail for. They won't even lie about it. They just go quiet and watch the deck like sailors who've run cargo long enough to know what telling earns them. You don't need them to. The cargo in the hold and the cut of the ships makes it plain enough. The Finndicate has scouts on this water, and the scouts have a heading you'd dearly love to read.\n\nThe choice is yours. Pick once, and only once.",
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
    flavor: "Past the Finndicate scouts the water turns to gray wall. The galleon waiting in the fog drew every chart Krust ever followed. Sink him and the Finndicate loses its eyes.",
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
      dropsNote: 'One crate per Cartographer clear, rolled once and scaled by your Fortune. Every kill along the way pays gold + Nav XP, and the run carries two Tide events between fights. Read them and choose.',
    },
  },
  {
    // Challenge variant of The Cartographer. Same scaling rules as
    // Pete + Krust challenge nodes. No phase 2. Riposte is already
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
      { text: "The Cartographer's charts and Krust's beacon map finally point the same way, and the old charts leave that spot blank. No depth, no name. Just a warning nobody bothered to finish writing." },
      { ...GUIDE.mako, text: "The Cartographer folded like a wet chart. And still every line he ever drew runs to the same place. Down." },
      { ...GUIDE.doby, text: "Because he was never the place, small fry. Only the finger pointing at it." },
      { ...GUIDE.kat, text: "The crews out here have a name for that water. I've watched grown captains find something else to look at rather than give it to me." },
      { text: "The Gullet. Where the sea swallows everything down.", pause: 900, fx: 'shake' },
      { ...GUIDE.dole, text: "The Gullet. Everyone says it like a curse. It's a current with a very good reputation and very bad manners." },
      { ...GUIDE.dole, text: "Three charts, one point of water, and no two agree on the depth. Warnings are cheaper than that. Somebody wants this water unvisited." },
      { ...GUIDE.doby, text: "Whatever the Finndicate takes off the weak, it all ends up down that throat. And now so do we." },
      { text: "Dole has already inked a heading you had not thought to ask for.", pause: 400 },
    ],
    sceneAccent: '#8fa76b',
    detail: {
      description:
        "The Cartographer's charts and Krust's beacon map finally agree: every freight lane bends to one drowned anchorage far past the danger line, the place the old charts leave blank with only a warning. The crews call it the Gullet, and say it as little as they can. Whatever the Finndicate takes off the weak gets swallowed down there, and that's exactly where you're bound.",
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
      { text: "No time to be careful. Pick your play and roll the bones.", pause: 400 },
    ],
    sceneAccent: '#8fa76b',
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
        { ...GUIDE.dole, text: "No sail, then. Mercy compounds like interest. A pity you didn't invest." },
      ],
    },
    scene: [
      { text: "A cutter slides out of the fog and pulls in alongside you. No flag, but you know that hull." },
      { text: "The scouts you let go, way back past the danger line. Turns out the cold water remembers." },
      { speaker: 'A Freed Scout', portrait: '/krust_soldier.png', text: "We owe you a deck, captain. We pay what we owe." },
      { speaker: 'A Freed Scout', portrait: '/krust_soldier.png', text: "Every crew in the Gullet sails loaded. They've all got a shot in the pipe before the fight even starts." },
      { speaker: 'A Freed Scout', portrait: '/krust_soldier.png', text: "They'll hit you on the first bell, before a slow captain's even found his range. Go in ready to take one." },
      { text: "They hand across a strongbox and a folded chart, and slip back into the gray." },
      { text: "Richer, wiser, and not sailing in blind anymore. *The mercy paid.*" },
      { ...GUIDE.dole, text: "A crew that settles its debts in charts. I like them already." },
      { ...GUIDE.dole, text: "They're right about the first bell. Every hull in the Gullet opens loaded. Take on someone who sees it coming, and you open smarter." },
    ],
    detail: {
      description:
        "You hold at the mouth of the Gullet and watch the fog. Out here a captain gets back exactly what he gave, no more. If you cut those scouts loose back past the danger line, the cold water remembers, and a sail comes out of the gray to settle the debt with coin, charts, and a warning worth more than both. If you didn't, the fog stays empty and you go in the way you came.",
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
    // Chapter II closer. "Between Watches". Cast grown by one (Dole).
    id: 'chapter_2_close',
    type: 'story',
    label: 'Between Watches',
    flavor: "The Gullet drained and its collector under. Before the next heading, the crew takes a watch together, one hand heavier than it sailed in.",
    bridge: "The rest never lasts. Past the drained throat, the water only keeps going down.",
    requiresNode: 'gullet_raid',
    image: '/raidlog.png',
    scene: [
      { text: "The Gullet drains to mud, the Tollmaster with it, and the crew catches its breath in water that finally holds still." },
      { ...GUIDE.dole, text: "Three of the Finndicate's captains on the bottom now, and every one of them pointed us further down. I do love a pattern." },
      { ...GUIDE.doby, text: "Patterns end somewhere, navigator. This one ends deep. I can feel it in the old bones." },
      { ...GUIDE.mako, text: "Deep is where the big things live. Suits me." },
      { ...GUIDE.kat, text: "It suits none of you, and you all know it, and you're going anyway. Sit down and let me look at that arm before you bleed on my clean deck." },
      { text: "Past the drained throat, the water keeps going down, darker than any chart will admit. But that is tomorrow's heading.", pause: 700 },
      { text: "Tonight the crew is whole, one hand heavier than it was, and the grog is cold." },
    ],
    detail: {
      description:
        "The Gullet is mud and the Tollmaster is under it. Before the next heading the crew takes a quiet watch: Dole reads the pattern in the dead captains, Doby feels the deep coming in his old bones, Mako grins at it, and Kat patches the lot of them. The water ahead only goes down. Tonight the crew is whole.",
      ctaLabel: 'Rest a While →',
      summary: "With the Gullet drained and the Tollmaster under, the crew took a watch together before the deeper water ahead. One hand heavier, and whole.",
    },
  },
  {
    // Chapter II's closing class pick. Mirrors chapter_1_class. Now gated on the
    // Between Watches closer. Writes profiles.ship_classes['sunken_hand'].
    id: 'chapter_2_class',    type: 'class_pick',
    label: "Captain's Choice",
    flavor: "Three Finndicate captains on the seabed and the Gullet drained dry. Time to decide what your name stands for on the deep water.",
    requiresNode: 'chapter_2_close',
    classPick: { chapterId: 'sunken_hand' },
    detail: {
      description:
        "You read the Cartographer's seas, cracked the Gullet's cipher, and put its collector under. Pick a class for the deep water ahead. Once it's chosen it stays with you for every raid from here on, stacking with the captain you already are.",
      dropsNote: 'Deepen the class you already sail (a Mark II that stacks on top of it) or branch into a fresh one. Permanent, and the other options are gone for good.',
      ctaLabel: 'Pick a class',
    },
  },

  // ── CHAPTER III. The Coffers (raids 5 & 6) ──────────────────────────────
  // LIVE since 2026-07-04 (adminOnly flags + route is_admin guards dropped).
  // Story spine: the Quartermaster's Cache (the shop you've bought from since
  // Ch I) is revealed a Finndicate front, and names Don Finleone. The Ch IV hook.
  {
    id: 'coffers_heading',    type: 'story',
    label: 'Where the Coin Sleeps',
    flavor: "Spet weighed everything the Gullet swallowed, but he never kept it. His manifests all point the same way, to a harbor with no name on any honest chart.",
    bridge: "You have the name now: the Coffers, where every coin the sea swallowed surfaces again in the wrong hands. The only ways in are a blockade or a bribe.",
    requiresNode: 'chapter_2_class',
    image: '/raidlog.png',
    scene: [
      { text: "Tollmaster Spet weighed every crate the Gullet swallowed and kept not a coin of it. His manifests all point the same way, past the throat, to a harbor no honest chart will name." },
      { ...GUIDE.dole, text: "A market. A whole drowned market, where the sea's plunder gets counted, shelved, and sold back to the next captain fool enough to come up for it. They don't spend what they take. They inventory it." },
      // The one bridge between Ch III's resale framing and the finale's "the
      // whole syndicate was funding a hunt". Reads as a bookkeeper's grumble
      // about overheads on first pass; on re-read it is the tackle-box budget.
      { ...GUIDE.dole, text: "Though the sums do not sit right. A market that size takes in a great deal more than it ever sells, and the difference goes back out again on deep-water headings nobody bothers to log. Charts, sounding line, gear for water no crew should want. Somebody down here is outfitting for something." },
      { ...GUIDE.doby, text: "I swam past this harbor once, long ago, and swore I never would again. A market that sells the drowned back to the living. Nothing good keeps its books this deep." },
      { text: "A broad shadow settles over the chart. Old scales, older eyes. A captain the sea was said to have kept, years back.", pause: 500 },
      { ...GUIDE.laz, text: "The Coffers. I know this harbor. I was counted and shelved here once, same as the plunder." },
      { ...GUIDE.laz, text: "The drowned market takes everything and files it as a debt. I am the one account it failed to close." },
      { ...GUIDE.laz, text: "Laz. When you crew up for the dark water, put my name at the top of the list. I know the way in, and I know exactly what it costs." },
      { text: "He makes the offer like a thing already weighed, and leaves the choosing to you.", pause: 400 },
    ],
    detail: {
      description:
        "Every manifest off Spet's deck points the same way: past the Gullet to a harbor the honest charts leave blank, a drowned black market where the whole sea's plunder gets counted and sold again. The crews call it the Coffers. Everything the Finndicate has taken off the weak for years is stacked down there behind a wall of guns, and somewhere in the stalls is the shopkeeper who keeps the books on all of it.",
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
    // your way in (pay 10k), or run the blockade. One cannon shot at the boom
    // chain. Land a big enough hit and you punch through free; fall short and
    // you limp in under fire, owing 20k in repairs. Node id kept so the
    // downstream chain (coffers_lens.requiresNode) is untouched.
    id: 'coffers_fork',    type: 'dps_check',
    label: 'The Harbor Gate',
    flavor: "A locked gate bars the way into the Coffers. Blow it open with one good cannon shot, or pay the dockmaster to wave you through.",
    bridge: "The gate's behind you, and the market's war-fleet is already turning to meet you.",
    requiresNode: 'coffers_heading',
    image: THE_COFFERS_FLEET.enemies.scout.portrait,
    dpsCheck: {
      threshold: 40,
      payCost: 10000,
      failCost: 20000,
    },
    detail: {
      description:
        "One locked gate stands between you and the Coffers. Fire a single cannon shot at it: hit hard enough and it blows open for free. Come up short and you limp through under fire, and the repairs cost you 20,000 doubloons. Or skip the shot and just pay the dockmaster 10,000 to wave you in.",
      dropsNote: 'Fire one shot and deal 40+ damage to pass for free, or pay 10,000 to skip it. A missed shot costs 20,000 in repairs.',
      ctaLabel: 'Approach the Gate',
    },
  },
  {
    id: 'coffers_lens',    type: 'puzzle',
    label: 'The Signal Maze',
    flavor: "The way past the harbor wall is to light the smugglers' own signal-lens, and the lantern that feeds it fires its beam through a maze of mirrors the market keeps deliberately crooked.",
    bridge: "The lens flares green and the boom-chain drops into the water. The harbor fleet is dead ahead now.",
    requiresNode: 'coffers_fork',
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
    // The LAST Quartermaster's Cache. A rig choice (masts vs sails) right before
    // the fleet fight, and the final "friendly" stop before the betrayal at
    // quartermaster_turn. The keeper's a touch too glad to see you, seeding it.
    // Reuses the generic `choice` node + claimQuartermasterChoice action.
    id: 'coffers_cache',
    type: 'shop',
    label: 'The Last Cache',
    flavor: "The Quartermaster's Cache keeps a stall even here, deep in the Coffers. The keeper waves you over, all smiles, and lays out two cuts of rigging. Take one.",
    bridge: "New rig lashed on, and the market's war-fleet dead ahead. Whatever the keeper's grinning about, it'll keep till the guns are quiet.",
    requiresNode: 'coffers_lens',
    choice: { items: ['crows_nest_rigging', 'trade_wind_sails'] },
    detail: {
      description:
        "Even here, in the drowned heart of the market, the Quartermaster's Cache keeps a stall. The same shady supplier that's kitted you out since the coast. The keeper's all smiles today, a shade too glad to see you. He lays two cuts of ship's rigging on the counter: a crow's-nest set that sharpens your eye, or trade-wind canvas that keeps your guns fed. Pick one. The other rolls back under the counter.\n\nWhatever you take is yours to keep, ready to equip in your raid loadout.",
      dropsNote: 'Pick one rig. Permanent, equippable, and you can\'t come back for the other.',
    },
  },
  {
    // Quartermaster foreshadow. A short character beat between the last Cache
    // and the fleet fight. The keeper is too glad, too knowing, and lets slip
    // that flying his goods "counts for something" without saying to whom. Plants
    // the betrayal that lands for real at quartermaster_turn (after Raid 5).
    id: 'coffers_keeper',
    type: 'story',
    label: "The Keeper's Smile",
    flavor: "The Quartermaster who runs the Cache is too glad to see you, and too sure of your picks. He arms every captain who comes through the Coffers, and something in his smile says he knows how it ends for most of them.",
    bridge: "The war-fleet turns to meet you. Whatever the Quartermaster is playing at, it'll keep until the admiral's on the harbor floor.",
    requiresNode: 'coffers_cache',
    image: '/raidlog.png',
    scene: [
      { text: "You re-arm at the Quartermaster's Cache, the same stall that's kitted you out since the coast, while he watches from behind his counter, enjoying every moment of it." },
      { speaker: 'The Quartermaster', portrait: THE_QUARTERMASTER.enemies.quartermaster.portrait, text: "Good pick. I'd have steered you to it myself. I always do." },
      { speaker: 'The Quartermaster', portrait: THE_QUARTERMASTER.enemies.quartermaster.portrait, text: "Every captain who sails into the Coffers gets kitted out right here at my counter. Then I watch how far they get." },
      { text: "The way he says it puts a cold coin in your gut. Like he's already seen *how your story ends*.", pause: 600 },
      { ...GUIDE.kat, text: "I don't like him. Anyone that glad to see you has already sold you to somebody. Keep a hand near your cutlass and your eyes on his." },
      { speaker: 'The Quartermaster', portrait: THE_QUARTERMASTER.enemies.quartermaster.portrait, text: "That admiral past the wall has never lost a fight. But every gun on your deck, you bought off me. Don't forget that, captain." },
      { text: "You want to ask whose side he's really on. Then the war-fleet swings around, and there's no more time for questions." },
      { text: "You'll come back to it later, once the admiral's on the harbor floor." },
      { ...GUIDE.laz, text: "That smile. I've seen it on every shopkeeper who ever sold a captain the rope he hangs by." },
      { ...GUIDE.laz, text: "Trust the guns, captain. Not the hand that sold them. When the fleet turns, hold the line and let him keep his questions." },
    ],
    detail: {
      description:
        "You re-arm at the Quartermaster's Cache one last time, and the shopkeeper is friendlier than any fair trade explains. He says he arms every captain who sails into the Coffers, then watches how far they get, and he reminds you, a little too pointedly, that every gun you carry came off his counter. It sits wrong. But the market's war-fleet is already turning to meet you, and the question will keep.",
      drops: [
        { emoji: '📜', label: 'Overheard at the Counter', sublabel: "\"Every gun on your deck, you bought off me. Don't forget that, captain.\"", rarity: 'uncommon' },
      ],
      dropsNote: 'A last word from the Quartermaster before the fleet. Whatever he means by it, it waits till the guns are quiet.',
      ctaLabel: 'Meet the Fleet →',
      summary: "At the last Cache the Quartermaster was oddly friendly, saying he arms every captain who sails into the Coffers and watches how far they get, and pointing out that every gun you carry came off his counter. You filed the unease away and turned to face the market's war-fleet.",
    },
  },
  {
    // Raid 5. The escort-fleet admiral guarding the Coffers. The player's first
    // capital-ship fight (Galleon-tier). Signature: Decoys (false crit bands) +
    // the admiral's phase 2 + tier-2 tides. The lionfish deception fleet (Plume/
    // Fantail/Bristle/Barb) under Admiral Ruse, on the 'harbor' backdrop. LIVE.
    id: 'coffers_fleet',    type: 'raid',
    label: 'The Harbor Fleet',
    flavor: "The market keeps a war-fleet, and an admiral who's never lost a hull. His gunners run false colors on every shot, so you never know which gun is the one that's loaded.",
    bridge: "The admiral's fleet is wreckage on the harbor floor, and the way to the market's heart is open. The last push is on the keeper himself now.",
    requiresNode: 'coffers_keeper',
    requiresNavLevel: 40,
    route: '/raids/coffers-fleet',
    raidId: THE_COFFERS_FLEET.raidId,
    image: THE_COFFERS_FLEET.enemies.admiral.portrait,
    detail: {
      description:
        "The Coffers' war-fleet, and the admiral who has never lost a ship. His crews fight under false colors: decoy gun-bands strewn across your aim so you can't tell the live shot from the feint. The biggest hulls you've faced yet, and the admiral rises again when you think you've sunk him.",
      enemies: ['Plume ×2', 'Fantail ×2', 'Bristle ×2', 'Barb ×2', 'Admiral Ruse'],
      drops: lootDrops(THE_COFFERS_FLEET.loot),
      clearReward: clearPayout(THE_COFFERS_FLEET),
      dropsNote: 'One crate per clear, rolled once and scaled by your Fortune. Every kill pays gold + Nav XP, and the run carries two stronger Tide events between fights.',
    },
  },
  {
    id: 'coffers_fleet_challenge',    type: 'raid',
    label: 'Challenge: The Harbor Fleet',
    flavor: "The same fleet, drilled harder and flying meaner colors. The admiral does not lose his wall twice.",
    requiresNode: 'coffers_fleet',
    route: '/raids/coffers-fleet/challenge',
    raidId: THE_COFFERS_FLEET_CHALLENGE.raidId,
    sideBranch: { parentId: 'coffers_fleet' },
    image: THE_COFFERS_FLEET.enemies.admiral.portrait,
    detail: {
      description:
        "The harbor fleet again, harder for the loss. More HP, sharper guns, the same wall of false colors, and the admiral's phase 2 bites deeper. The chase rewards roll richer for the trouble.",
      enemies: ['Plume ×2', 'Fantail ×2', 'Bristle ×2', 'Barb ×2', 'Admiral Ruse'],
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
    image: '/raidlog.png',
    scene: [
      { text: "You put in at the Quartermaster's Cache to re-arm. Same stall that's kitted you out since the coast." },
      { speaker: 'The Quartermaster', text: "Captain. Knew you'd wash up here eventually. They all do." },
      { speaker: 'The Quartermaster', text: "Every hook, every cannon, every clever little trick. You bought it all off me." },
      { speaker: 'The Quartermaster', text: "The Cache was *never neutral*, captain. There's no such thing out here.", pause: 800 },
      { text: "The guns behind the counter swing your way. The shelves you've trusted since the coast were *Finndicate all along*.", fx: 'shake' },
      { speaker: 'The Quartermaster', text: "I armed you because they let me. And whatever I sold you, *I can take back*.", pause: 600 },
    ],
    sceneAccent: '#dc2626',
    detail: {
      description:
        "The Quartermaster's Cache, the shady stall that's armed you since the coast, sits in the heart of the Coffers, and the keeper's been expecting you. It was a Finndicate front the whole time. Every piece of kit you bought was a leash, and the merchant who sold it can yank it back. He answers to the don who runs the market, the first time you hear the name: Don Finleone.",
      drops: [
        { emoji: '📜', label: "Captain's Logbook, Fragment IX", sublabel: "\"The one who armed you and the one hunting you were always the same.\"", rarity: 'rare' },
      ],
      dropsNote: 'The betrayal at the heart of the Coffers: the shop was theirs, and it names the don above it.',
      ctaLabel: 'Face the Keeper →',
      summary: "The Quartermaster's Cache, the stall that armed you since the coast, was a Finndicate front all along. The keeper turned his guns on you, and named the don he answers to: Don Finleone.",
    },
  },
  {
    // Pursuit dice beat. The counting-house has gone to a riot now the keeper's
    // turned on you. Grab a strongbox before his muscle reaches you. Risk/reward
    // d20, mirrors gullet_bones. Non-combat, one-time.
    id: 'coffers_strongbox',    type: 'dice',
    label: 'Crack the Strongbox',
    flavor: "The keeper's guns are out and his floor's gone to chaos. Bolted to the counting-house planks sits a strongbox fat with the day's take, and his muscle is closing fast. Time for exactly one grab.",
    bridge: "Strongbox settled one way or the other, you shove deeper into the market, toward the light-lock that bars his vault.",
    requiresNode: 'quartermaster_turn',
    image: '/raidlog.png',
    scene: [
      { text: "The moment the keeper's guns come up, his counting-house turns into a riot.", fx: 'shake' },
      { text: "Clerks bolt, coin scatters underfoot, and his hired muscle starts shoving through the crowd toward you." },
      { text: "Bolted to the planks by the scales sits a strongbox, lid still warm from the day's counting." },
      { text: "You'll get one grab at it before they reach you. Pick your play and be quick.", pause: 400 },
    ],
    sceneAccent: '#dc2626',
    dice: {
      bonusPerLevels: 10,
      maxBonus: 4,
      options: [
        {
          id: 'till',
          label: 'Skim the till',
          description: "Sweep the loose coin off the counter and keep moving. Easy, safe, and a little beneath a strongbox like that.",
          dc: 8,
          win: { doubloons: 1500 },
          miss: { doubloons: 500 },
          winText: "You come away with two fists of the market's coin and never break stride.",
          missText: "Half of it spills as you grab, but a fair weight lands in your hold anyway.",
        },
        {
          id: 'force',
          label: 'Force the strongbox',
          description: "Put a bar under the lid and lean on it before the muscle arrives. More coin, less time.",
          dc: 12,
          win: { doubloons: 2800, navXp: 200 },
          miss: { doubloons: 700 },
          winText: "The lid pops with a crack and you scoop the day's take clean into your hold.",
          missText: "The lid gives late and you snatch what you can as the first of his muscle reaches you.",
        },
        {
          id: 'blow',
          label: 'Blow the safe',
          description: "Powder-charge the whole safe and take everything at once. All or nothing, and a bad light costs you.",
          dc: 16,
          requiresDoubloons: 1000,
          win: { doubloons: 5000, navXp: 500 },
          miss: { doubloons: -1000 },
          winText: "The charge blows the safe wide and you haul off more coin than the fleet outside was worth.",
          missText: "The powder catches wrong, the blast throws you back empty-handed, and your own charge cost you a purse.",
        },
      ],
    },
    detail: {
      description:
        "The keeper's turned his guns on you and his counting-house has gone to a riot: clerks bolting, coin underfoot, his hired muscle shoving toward you through the crowd. Bolted to the planks by the scales sits a strongbox fat with the day's take. You get one grab before they reach you. Throw the bones on it: skim the loose till for safe coin, force the box for more, or powder-charge the whole safe for everything it holds, knowing a bad light costs you.",
      dropsNote: 'Pick one grab and roll once. The safe play always pays; blowing the safe can cost you doubloons on a miss, and only opens to a captain who can cover the loss.',
      ctaLabel: 'Throw the Bones →',
    },
  },
  {
    id: 'coffers_vault_lens',    type: 'puzzle',
    label: 'The Vault Beam',
    flavor: "The Quartermaster's strongroom answers to a lock of light: a sunbeam channelled down through the market's roof, off a row of mirrors he can crook from behind his counter. Straighten them and the vault opens.",
    bridge: "The beam strikes the vault-eye and the strongroom bars grind back. The keeper is cornered behind them now.",
    requiresNode: 'coffers_strongbox',
    puzzle: {
      kind: 'mirror',
      rewardNavXp: 750,
      mirror: {
        // 10x10, the chapter's hardest. A PRISM splits the trunk into two arms;
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
        "The beam threads the last mirror and strikes the vault-eye dead center. Deep in the iron, the strongroom bars grind back.\n\nThe Quartermaster's behind them, cornered, with nowhere left to run.",
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
    // The lore/dread payoff. Inside the opened vault, the keeper's ledger of
    // every captain he armed and how each sank. Earns Repossession + deepens
    // Finleone one beat before the boss. Fragment X. Non-combat story.
    id: 'coffers_ledger',    type: 'story',
    label: 'The Ledger of Debts',
    flavor: "The Quartermaster's vault isn't a strongroom. It's the back-stock of a shop, drowned and kept, and chained in the middle of it is a ledger naming every captain he ever armed and how each one sank.",
    bridge: "You know now what the Cache really was. The Quartermaster's cornered against his own shelves, still smiling, and every debt in his book runs up to one name: Don Finleone.",
    requiresNode: 'coffers_vault_lens',
    image: '/raidlog.png',
    scene: [
      { text: "The bars grind back and the vault breathes out cold, coin-smelling air. It isn't a strongroom. It's a shop's back-stock, sunk to the bottom of the sea and kept dry." },
      { text: "Shelf on shelf of other captains' plunder, every piece tagged, sorted, and priced to sell back to whoever comes up next." },
      { text: "Chained to a stand in the heart of it, a ledger the size of a hatch cover. Every captain the Quartermaster ever armed, and beside each name, a note on how they sank." },
      { text: "Lost off the Shrouds. Drowned in the Gullet. Sold their own hull back a plank at a time. Debt cleared, debt cleared, debt cleared.", pause: 500 },
      { text: "Your name's near the bottom, in fresh ink. The line for how you sank is still blank.", pause: 700 },
      { speaker: 'The Quartermaster', portrait: THE_QUARTERMASTER.enemies.quartermaster.portrait, text: "Every account in that book closes the same way, captain, and every one settles up to the don. Finleone likes his ledgers tidy. Yours is the one line I have left open." },
      { ...GUIDE.laz, text: "I know this book. My name is a few pages up, and the line for how I sank was filled in long ago." },
      { ...GUIDE.laz, text: "They were wrong. I have read this ledger from the other side of it. Let me be the one to see his account closed the right way." },
      { speaker: 'The Quartermaster', portrait: THE_QUARTERMASTER.enemies.quartermaster.portrait, text: "You think Finleone stocked these shelves? Somebody stocked *him*. Somebody who never once came down here to collect." },
      { ...GUIDE.laz, text: "He's stalling. Close the account." },
    ],
    detail: {
      description:
        "The vault opens not on a strongroom but on a shop's drowned back-stock: shelf on shelf of other captains' plunder, tagged and priced to be sold back to the next crew that comes up. Chained at its heart is the Quartermaster's ledger, naming every captain he ever armed and, beside each name, a note on how they sank. Your own name sits near the bottom in fresh ink, that note still blank. And every debt in the book runs up to one name: Don Finleone. Now you understand the Quartermaster's smile, and why he opened this fight by taking his own guns back off you.",
      drops: [
        { emoji: '📜', label: "Captain's Logbook, Fragment X", sublabel: "\"He wrote down how every captain he armed would die. Mine is the only line he hasn't filled in.\"", rarity: 'rare' },
      ],
      dropsNote: 'The truth of the Cache, and the name the Quartermaster answers to: Don Finleone. Whatever he sold you, he can take back.',
      ctaLabel: 'Settle the Account →',
      summary: "Inside the vault you found the Quartermaster's ledger: every captain he ever armed, each with a note on how they sank, all running up to Don Finleone. Your name's in it, the note on your death still blank, and he means to take his guns back.",
    },
  },
  {
    // Raid 6. The chapter finale. The Quartermaster (Galleon-tier). Signature:
    // Repossession (reclaims one equipped raid item at fight start) + a 4-phase
    // final-boss duel. LIVE config (THE_QUARTERMASTER), on the 'vault' backdrop
    // (lantern-lit gun-deck). LIVE for all players.
    id: 'the_quartermaster',    type: 'raid',
    label: 'The Quartermaster',
    flavor: "The keeper of the Cache fights the way he sells: he opens by taking back a piece of your own kit, then makes you buy your life off him one shot at a time.",
    bridge: "The Quartermaster goes down under his own counter and the Cache's hold falls open for good. Every debt in that ledger settles at once, and the account runs up past him, to the don.",
    requiresNode: 'coffers_ledger',
    requiresNavLevel: 48,
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
    // Chapter III closer. "Between Watches", now carrying the Don Finleone
    // reveal in its opening beats (merged in from the old finleone_named node,
    // to kill the two-story-nodes-back-to-back beat). The ledgers spill and name
    // the don, then the counter burns down into the crew's watch. Cast grown by
    // one (Laz). requiresNode moved up to the_quartermaster.
    id: 'chapter_3_close',
    type: 'story',
    label: 'Between Watches',
    flavor: "The Quartermaster's ledgers spill and name the don at the top of it all. Then the Coffers burn low, and before the deepest water the crew takes a watch together, one navigator unable to quite settle.",
    bridge: "You have the don's name now: Finleone, at the top of every ledger. The rest never lasts, and past the last of the Coffers' light the sea drops toward the seat he rules from.",
    requiresNode: 'the_quartermaster',
    image: '/raidlog.png',
    scene: [
      { text: "The Quartermaster's strongbox cracks, and the last of his ledgers spill across the deck. Not one of them argues with the others." },
      { ...GUIDE.dole, text: "I've been adding this up since the coast, and here's the sum. Pete fed Krust. Krust fed the Gullet. The Gullet fed this market. And every coin of it, all of it, runs up to one signature." },
      { ...GUIDE.laz, text: "Don Finleone. A megalodon the sea was said to have swallowed and thought better of. He runs the Coffers, and the Coffers ran everything." },
      { ...GUIDE.mako, text: "The head of the whole Finndicate, and he sits at the bottom of the deepest water there is. I've wanted to bite something that size my whole life.", pause: 500 },
      { text: "The Coffers burn low, the Quartermaster's counter down to kindling, and for the first time since the harbor gate the deck goes quiet." },
      { ...GUIDE.kat, text: "You say the loveliest things right before I have to stitch you back together. Sit down, the pair of you." },
      { ...GUIDE.laz, text: "I knew a captain once who thought he was the biggest thing in the water. The water disagreed. It always does, in the end." },
      { ...GUIDE.doby, text: "Cut the head and the whole body falls. That's the plan, is it not, navigator?" },
      { ...GUIDE.dole, text: "It is. It should even be true." },
      { ...GUIDE.doby, text: "There's a doubt in your voice." },
      { ...GUIDE.dole, text: "There's a margin in my notes I can't account for. A few sums that tie up to no name I have. But that's a worry for deeper water. Tonight, we won.", pause: 500 },
      { text: "Past the last of the Coffers' light, the sea drops away toward the seat the don rules from. But that is tomorrow's heading.", pause: 700 },
      { text: "Tonight the crew is whole, one hand heavier still, and the grog is cold." },
    ],
    detail: {
      description:
        "The Quartermaster's ledgers spill and settle the same way every time: up to one signature, Don Finleone, the megalodon who runs the Coffers and every Cache that feeds them. As far as any ledger in the market knows, he is the head of the Finndicate. Then the counter burns low and the crew takes a watch: Mako itching to bite something megalodon-sized, Kat threatening to stitch him for saying so, Laz grave over how big things end, and Dole unable to shake a margin in his notes that will not add up. A worry for deeper water. Tonight the crew is whole.",
      drops: [
        { emoji: '📜', label: "Captain's Logbook, Fragment XI", sublabel: "\"Every debt in the market runs up to one name: Finleone. Every ledger down here calls him the head of the whole Finndicate.\"", rarity: 'rare' },
      ],
      dropsNote: 'The don named at the top of every ledger, and the crew whole before the deep.',
      ctaLabel: 'Read the Ledgers →',
      summary: "The Quartermaster's ledgers all ran up to Don Finleone, the megalodon who runs the Coffers and the whole Finndicate. Then the crew took a watch before the deepest water. Dole cannot quite settle a margin in his notes, but tonight the crew is whole.",
    },
  },
  {
    // Chapter III's closing class pick. Now gated on the Between Watches closer.
    // Writes profiles.ship_classes['the_coffers'], stacking with chapters I + II.
    id: 'chapter_3_class',    type: 'class_pick',
    label: "Captain's Choice",
    flavor: "The Coffers in ruins, the Quartermaster under, and a don's name at the top of every ledger. Time to set what your colors mean before the deepest water.",
    requiresNode: 'chapter_3_close',
    classPick: { chapterId: 'the_coffers' },
    detail: {
      description:
        "You ran the harbor wall, faced the market's fleet, and put the Quartermaster under his own counter. Pick a class for the deep water where Finleone waits. It stays with you for every raid from here on, stacking with the captain you already are.",
      dropsNote: 'Deepen the class you already sail or branch into a fresh one. Permanent, and the other options are gone for good.',
      ctaLabel: 'Pick a class',
    },
  },
  // ── Chapter IV. The Last Fathom. FULLY LIVE since 2026-07-19 — Raid 8 (Don
  //    Finleone) and the chapter close shipped; no adminOnly gates remain. ───────
  {
    id: 'throne_heading',   type: 'story',
    label: 'The Deepest Water',
    flavor: "The Coffers burn behind you and every ledger points one way: down, past the last sounding on any chart, to the seat Don Finleone rules from. The deepest water there is. And nothing waits past it.",
    bridge: "The heading is set for the don's own water. And the Quartermaster's seized stock sails with you. A vault of everything he never sold you.",
    requiresNode: 'chapter_3_class',
    image: '/raidlog.png',
    scene: [
      { text: 'The Coffers burn low behind you, and the sea ahead simply runs out of chart. Past the last sounding, past the last named reef, the water only goes down.' },
      { ...GUIDE.doby, text: 'The last fathom. I was born in water like this, small fry. Black, and cold, and patient. It is the one part of the sea I have ever been afraid of.', pause: 400 },
      { ...GUIDE.doby, text: 'Good. Fear is how an old whale stays an old whale. Take us down.' },
      { text: 'You are not the only sail bound for the edge of the chart. One you do not know has been holding your distance since the Coffers, matching you turn for turn.', pause: 500 },
      { ...GUIDE.mira, text: "Don Finleone. The one bounty in this whole sea nobody's fool enough to chase. And here you are, sailing off the last sounding to do exactly that." },
      { ...GUIDE.mira, text: "I do love a captain with no sense of self-preservation. It's the only kind worth following." },
      { ...GUIDE.mira, text: 'Mira. I hunt the marks the smart money leaves alone. When you crew up for the deepest water, put my name down. I want a good seat for this one.' },
      { text: "She lets her sail settle in beside yours like the hunt's already decided." },
    ],
    sceneAccent: '#6ea8d8',
    detail: {
      description:
        "Past the Coffers there is no more market, no more middlemen, no more names between you and the don. The chase runs out of chart here: Don Finleone's seat lies in the deepest water there is, and the crew have taken to calling it the last fathom. The depth past which nothing comes back up. Set the heading.",
      drops: [
        { emoji: '📜', label: "Captain's Logbook, Fragment XII", sublabel: '"Past the last sounding the water only goes down. So that\'s where we go."', rarity: 'rare' },
      ],
      dropsNote: 'The final chapter opens. The heading is set for the deepest water.',
      ctaLabel: 'Set the Heading →',
      summary: 'The heading is set past the last sounding on any chart. For the deepest water there is, and the don who rules it. The final chapter has begun.',
    },
  },
  {
    // Cargo Shuffle #1. Sokoban in the powder hold before Sal Brackwater's
    // blockade. Three escalating rooms; every grid is validated by
    // web/verify-cargo.mjs (min moves 22 / 44 / 69 vs budgets 30 / 58 / 90).
    // Room 1 is additionally ORDER-FREE (either crate can seat first, // solver-proven): the opener must never carry a seal-the-room order trap,
    // that bite belongs to rooms 2-3. PORTRAIT boards only (cols ≤ 7, grow
    // ROWS). Wider overflows phones. KEEP THE SCRIPT IN SYNC when editing.
    id: 'throne_locks',      type: 'puzzle',
    label: 'The Powder Hold',
    flavor: "The don's water doesn't forgive a loose hold. Every powder crate stows on its mark before the blockade, or the first broadside does the stowing for you.",
    bridge: 'The hold is stowed tight and the guns are fed. Ahead: the blockade, and the don’s right fin who runs it.',
    // Hangs off the chapter OPENER, not the Ghost. The Ghost is a farm node on a side
    // branch; putting him in the main chain would force every captain through the
    // Quartermaster's challenge run to finish the chapter.
    requiresNode: 'throne_heading',
    puzzle: {
      kind: 'cargo',
      rewardNavXp: 900,
      reveal: 'The hold sits trim and the powder is dry.\nPast the next swell: the blockade line, and Sal Brackwater who holds it.',
      cargo: {
        rooms: [
          { moveBudget: 30, grid: [
            '######',
            '#   @#',
            '# $. #',
            '#    #',
            '##$  #',
            '#  . #',
            '######',
          ]},
          { moveBudget: 58, grid: [
            '#######',
            '#    .#',
            '# #$ .#',
            '#.$   #',
            '#   # #',
            '##$# @#',
            '#     #',
            '#######',
          ]},
          { moveBudget: 90, grid: [
            '#######',
            '#   # #',
            '#  $$ #',
            '#  $. #',
            '#   #.#',
            '#  #  #',
            '# #  @#',
            '#    .#',
            '#######',
          ]},
        ],
      },
    },
    detail: {
      description:
        'Three holds of powder crates, and every crate has a marked square it must sit on before the blockade. Crates shove, they never pull, so a crate pushed into a corner stays there. Stow all three holds within the move budget; run out of moves and the hold resets.',
      dropsNote: 'Solving the hold pays Nav XP. The budget resets the room, never the run. Read the hold before you shove.',
      ctaLabel: 'Stow the Hold →',
    },
  },
  {
    // RAID 7. The Blockade. Introduces the Ch4 suite: baseline enemy shields,
    // 4-cannonball magazines, and enemy SPECIALS (statuses thrown at you).
    // ── THE MUSTER ── a roster gate, not a fight. Sal's Death Roll can ONLY be
    // answered with a crew ability, and nothing in the game has ever said so. A
    // captain can arrive with five sharpshooters and simply have no legal answer to
    // the move that kills them. So the don's men count your hands first.
    id: 'blockade_muster',   type: 'muster',
    label: 'The Muster',
    flavor: "A cutter comes alongside before the line will part, and a clerk with a wet ledger counts your crew like livestock. He is not looking for guns. He is looking for hands that can do something when the shooting starts.",
    bridge: 'The clerk closes his ledger, unimpressed but satisfied. The line parts.',
    requiresNode: 'throne_locks',
    muster: {
      minCrew: 5,
      // Real data: every captain who can reach this node (Nav 56) runs a raid crew
      // between Lv 77 and Lv 100. 60 is a floor that says "bring your real crew",
      // not a wall.
      minLevel: 60,
      // Exactly what the fight beyond actually demands. The Death Roll is answered
      // with a brace or a shield and NOTHING else; four bars of a hard-hitting
      // crocodile are survived with a mender.
      requires: [['brace', 'shield'], ['heal']],
    },
    detail: {
      description:
        "The don's clerk comes aboard to count your crew before the line will part. He is not counting guns.\n\nWhat is past this point cannot be out-shot. Sal Brackwater will take your hull in his teeth and roll, and the ONLY thing that stops it is a crew ability. Not a dodge. Not a good shot. A crew member who can get between you and the blow.\n\nBring hands who can do something, or the clerk sends you home.",
      dropsNote: 'No cost and no fight. Bring the right crew and the line parts.',
      ctaLabel: 'Stand For Inspection →',
      summary: "The don's clerk counted your crew and found hands worth letting through.",
    },
  },
  {
    // The Quartermaster's Ghost. The FARM node, and the answer to a dead end the
    // forge created. Every Cache made you pick one item and leave the other, and
    // the forge is DESTRUCTIVE, so a component fused into a cannon is gone from
    // raid_items for good. Between those two rules a player could end up unable to
    // ever build a recipe. He fixes both: he still holds everything you left AND
    // everything you spent, and he can be run as many times as you like.
    // Boss-only, re-runnable, gated on having beaten him alive in his challenge.
    id: 'the_quartermasters_ghost',   type: 'raid',
    label: "The Quartermaster's Ghost",
    flavor: "The gun-deck is exactly as he left it, and so is he. The drowned keep better books than the living, and he never did stop counting what you owe.",
    bridge: "The ghost keeps his counter open. Whatever you left in the Caches, and whatever you have melted down since, he still has it, and he will keep handing it back for as long as you keep putting him down.",
    // He opens once the CLERK has passed you. The muster is where the game finally
    // says out loud that checks are answered with crew abilities, and the Ghost is
    // three more checks in a row. Hanging him off the inspection puts him exactly
    // where a captain has just been told what he is for.
    requiresNode: 'blockade_muster',
    requiresClearedNode: 'the_quartermaster_challenge',
    // Says where, not just what. The challenge is not a card on this map by
    // design, so naming it alone sent players looking for one.
    gateLockNote: 'Beat The Quartermaster on Challenge first. Open his raid card and pick Challenge.',
    sideBranch: { parentId: 'blockade_muster' },
    // He is a GOAL, not a wall. A captain who has not yet beaten the Quartermaster's
    // challenge should still be able to open him up and see the eight Cache items he
    // is holding, because that is the entire reason to go and beat it. Sealing him
    // shut would hide the carrot behind the stick.
    previewWhenLocked: true,
    // His identity is not a reveal to protect. Bosses are masked until beaten
    // because the FIGHT is the introduction, and that is simply not true here:
    // you cannot open him without having beaten the Quartermaster alive in his
    // challenge, so you have fought this character twice before you ever see
    // this card. Masking him also fought previewWhenLocked directly, whose
    // whole job is to show a locked goal's wares, and showed a "???" for the
    // one boss on the map you are meant to recognise on sight.
    revealBoss: true,
    route: '/raids/ghost',
    raidId: THE_QUARTERMASTERS_GHOST.raidId,
    image: THE_QUARTERMASTERS_GHOST.enemies.ghost.portrait,
    detail: {
      description:
        "He is holding every Cache item you left behind, and every one you forged away.\n\n50% DROP CHANCE EVERY CLEAR. Half your runs pay a Cache item, and it is split evenly across the ones you still need, so the last one is exactly as likely as the first was. Crew Fortune raises it, up to double. Run him as often as you like.\n\nHE FIGHTS WITH THEM. Your fire, your ice, your sights, your plating, your bearings, all turned on you. Every item you take back is one he can never use again.\n\nFOUR BARS, THREE CHECKS. He patches his hull with your plating, lights your fire-shot, and calls a shot down your own sights. Answer each with a CREW ABILITY.",
      enemies: ["The Quartermaster's Ghost"],
      drops: lootDrops(THE_QUARTERMASTERS_GHOST.loot),
      clearReward: clearPayout(THE_QUARTERMASTERS_GHOST),
      dropsNote: '50% chance of a Cache item every clear, spread evenly over the ones you do not currently have. Crew Fortune raises it.',
      summary: "The Quartermaster died still holding every Cache item you passed up, and he collects the ones you forge away too. Half your runs he hands one back, and you can run him as often as you like.",
    },
  },
  {
    // The story beat immediately before the fight. It plants Sal's TELL. He goes
    // still. So that when the water flattens mid-fight, the player has already been
    // told once, in a place where it cost them nothing to learn.
    id: 'thing_on_the_bar', type: 'story',
    label: 'The Thing on the Bar',
    flavor: 'Something long and low lies on the drowned bar, where the last sunken channel spills over into the deep. The lookout calls it a fallen spar and goes back to his knots. It is still there an hour later, in exactly the same place, and it has not moved once.',
    bridge: 'The spar was not a spar. It was waiting, and it was in no hurry at all.',
    requiresNode: 'blockade_muster',
    scene: [
      { text: 'The lookout calls a spar on the drowned bar at the lip of the drop. Half-sunk, barnacled, settled off some wreck down the sunken channel. Nobody looks twice.' },
      { text: 'An hour on, the bosun notices it is still there. Same bar. Same angle. The tide has moved a foot and a half in that time and the spar *has not moved at all*.', pause: 700 },
      { text: 'A spar drifts. A spar rolls with the water. This one is lying against the pull of the deep.', pause: 600 },
      { text: 'You watch it for a long minute. It does not move. Nothing about it moves. Then, without any part of it seeming to turn, you are aware that *it is facing you*.', pause: 1100, fx: 'shake' },
      { text: 'The blockade line is ahead. So is he. Remember this: when the water goes flat and nothing at all is happening, that is not nothing happening. *That is him deciding.*', pause: 800 },
      { ...GUIDE.kat, text: "A thing that doesn't move is a thing that's already decided you're food. I've pulled too many crews off too many decks not to know the look. Don't blink first, captain." },
      { ...GUIDE.mira, text: "A thing that lies perfectly still until the moment it doesn't. I know the type. I'm the type." },
      { ...GUIDE.mira, text: "So when the water goes flat, don't wait to see what he decides. Make him answer what you decide instead." },
    ],
    sceneAccent: '#e8e4dc',
    detail: {
      description:
        "A spar on the drowned bar that does not drift, does not roll, and does not move with the tide. Watch it long enough and you understand it is not wreckage. It is waiting.\n\nRemember the shape of it: when the water goes flat and nothing seems to be happening, that is Sal deciding.",
      dropsNote: 'The tell, learned for free instead of the hard way.',
      ctaLabel: 'Watch It →',
      summary: 'A spar on the drowned bar that never drifted. It was not a spar, and it had been watching for some time.',
    },
  },
  {
    id: 'the_blockade',    type: 'raid',
    label: 'The Blockade',
    flavor: "Don Finleone's blockade line, and the thing that holds it: Sal Brackwater, who has not moved in an hour and is not going to until it matters. Every hull rides behind a cold-light barrier, every magazine runs four deep, and his line fights dirtier than any market ever did.",
    bridge: "The blockade breaks and Sal Brackwater goes under it. The way to the don's own water lies open. And his books ride in your hold.",
    requiresNode: 'thing_on_the_bar',
    requiresNavLevel: 56,
    route: '/raids/blockade',
    raidId: THE_BLOCKADE.raidId,
    image: THE_BLOCKADE.enemies.saltie.portrait,
    detail: {
      description:
        "The don's escort fleet, and it does not fight like anything you have met.\n\nEvery hull rides behind a barrier, so your opening shots buy nothing but broken plating. Their magazines run four deep, and a ship that has been firing all round is never as empty as you would like. And they fight dirty: nets for your rudder, chain-shot for your guns, cracker rounds for your seams, and a gag order for your crew.\n\nAt the center of the line, something long and low lies in the water and does not move.",
      enemies: ['The Scute', 'The Bank', 'The Mangrove', 'The Rasp', 'The Wedge', 'Old Scar', 'The Muzzle', 'Sal Brackwater'],
      drops: lootDrops(THE_BLOCKADE.loot),
      clearReward: clearPayout(THE_BLOCKADE),
      dropsNote: 'One crate per clear, rolled once and scaled by your Fortune. The Chain-Shot Rack is the signature chase. Turn their own Weaken back on them. Two stronger Tide events between fights.',
    },
  },
  {
    id: 'the_blockade_challenge',    type: 'raid',
    label: 'Challenge: The Blockade',
    flavor: "The blockade re-forms, heavier at every post. Sal Brackwater does not hold a line twice. He buries it.",
    requiresNode: 'the_blockade',
    route: '/raids/blockade/challenge',
    raidId: THE_BLOCKADE_CHALLENGE.raidId,
    sideBranch: { parentId: 'the_blockade' },
    image: THE_BLOCKADE.enemies.saltie.portrait,
    detail: {
      description:
        "The blockade again, and it has learned. Every ship is tougher, every barrier thicker, and Sal rolls harder. Same rules, none of the mercy. The chase rewards roll richer for it.",
      enemies: ['The Scute', 'The Bank', 'The Mangrove', 'The Rasp', 'The Wedge', 'Old Scar', 'The Muzzle', 'Sal Brackwater'],
      drops: lootDrops(THE_BLOCKADE_CHALLENGE.loot),
      clearReward: clearPayout(THE_BLOCKADE_CHALLENGE),
      dropsNote: 'Every kill pays more and the clear bonus is steeper than the normal run.',
    },
  },
  {
    // THE SIXTH BERTH. The Man-o-War crew refit (5 -> 6), bought here. Sits
    // immediately after Sal Brackwater because Don Finleone's six-phase court
    // asks a crew ability of every phase: five hands cannot answer six. Clears
    // on read so a captain who cannot afford it yet is never blocked from the
    // chain; the purchase stays open on every revisit. Price = SIXTH_BERTH_COST.
    // NOT a shop. The node is where you LEARN the refit is possible; the purchase
    // itself happens in Manage Ship, beside the ship it changes. Buying a permanent
    // upgrade to your hull from a story sheet on the raid map was always the wrong
    // place for it.
    id: 'sixth_berth',    type: 'berth',
    label: 'A Sixth Crew Slot',
    flavor: "He came apart along the grain, the way he tore everything else apart, and his hull showed you its bones on the way down. Six berths framed into a deck that had no business carrying more than five. Nobody does that by accident.",
    bridge: 'The plans are in your chart locker and your carpenters have stopped arguing about whether it can be done. Six, if you want to pay for it.',
    requiresNode: 'the_blockade',
    berth: { price: SIXTH_BERTH_COST },
    detail: {
      description:
        "Your ship carries FIVE crew. Sal's carried six, and when he broke open you finally saw how: the deck is framed wrong on purpose, load taken where no shipwright would put it. The plans were still in his locker, salted and legible, and you took them.\n\nYour own carpenters can read them. Cut open the hull, re-frame it, and you sail with a SIXTH CREW SLOT: one more crew aboard, permanently, on every raid and every voyage.\n\nIt costs a fortune. Take the plans to your shipwrights in Manage Ship when you are ready to pay for it.",
      dropsNote: 'A permanent sixth crew slot, on raids and voyages both. Bought once in Manage Ship, and it never comes off.',
      ctaLabel: 'Take the Plans →',
      summary: "Sal's hull was framed for six, and you took the plans off the wreck. Your own shipwrights can cut a SIXTH CREW SLOT into your deck for a fortune: one more crew aboard, on every raid and voyage, permanently. Buy it in Manage Ship.",
    },
  },
  {
    id: 'crooked_ledger',    type: 'story',
    label: 'The Crooked Ledger',
    flavor: "Sal Brackwater's strongroom gives up the don's own accounts, every column in his own hand. Read them and the debts all run down into one pocket. Past one last lock, Don Finleone is waiting on his throne.",
    bridge: 'The books settle the argument: the don sits at the top of it all. One last lock, and then his throne.',
    requiresNode: 'sixth_berth',
    image: '/raidlog.png',
    scene: [
      { text: "The strongroom door gives with a groan, and Sal Brackwater's last secret spills out across the deck: ledgers stacked to the beam, every one filled in the same close, careful hand." },
      { ...GUIDE.dole, text: 'Give me a moment with these. Rates, tithes, tolls, drowned debts... and every column, every last one, runs down into the same pocket.' },
      { ...GUIDE.mako, text: 'Whose pocket?' },
      { ...GUIDE.dole, text: "One guess, and you won't need it. There's only ever been one name at the top of this water." },
      { ...GUIDE.doby, text: 'Finleone. Felt it in my gut a hundred leagues back. Another thing to hold it in his own ink, though.', pause: 400 },
      { ...GUIDE.kat, text: "Forty years I've watched good captains drown arguing whose fault the sea was. The don kept the answer in a ledger the whole time." },
      { ...GUIDE.dole, text: "Now that is a curiosity. There's a second hand in these margins, and it isn't his. Older. Finer. Initials a few odd sums that tie to no account I can find anywhere in the book." },
      // The letter goes on screen ONCE, as a shape, and nobody remarks on it. The
      // finale's discovery beat (Mira reading an F off this page) needs the
      // player's eye to have passed over it here and skipped it.
      { text: 'One letter, looped small and patient at the bottom of a column, over and over, page after page.', pause: 500 },
      // Mira dismisses it, because the finale has her quote this exact moment
      // back at herself ("I told you it was a dead partner. I *swore* to you").
      { ...GUIDE.mira, text: "Dead partner. Some debt he never troubled to close. Every old crook keeps a ghost or two in his columns, and none of them ever collect." },
      { ...GUIDE.doby, text: 'Leave it lie. We have a don to put in the ground.' },
      { ...GUIDE.laz, text: "Then the books are done talking. He's at the end of them, on his throne, waiting. Let us go settle the account in person.", pause: 400 },
    ],
    detail: {
      description:
        "Sal Brackwater's strongroom gave up the don's ledgers, every column in Finleone's own hand. The debts all run down into one pocket: his. Dole finds one margin in an older hand nobody can place, initialling a few odd sums that tie to nothing. A dead partner's ghost, most like. Nothing between you and the throne now but one last lock.",
      drops: [
        { emoji: '📜', label: "Captain's Logbook, Fragment XIII", sublabel: `"Every debt runs up to Finleone, and every book agrees he is the head of it. There is one margin that does not. The throne is ahead."`, rarity: 'rare' },
      ],
      dropsNote: "The don's whole empire, balanced to the coin in his own careful hand.",
      ctaLabel: 'Open the Ledgers →',
      summary: "Sal Brackwater's strongroom gave up the don's ledgers. Every column runs down into one pocket: Finleone's. The books settle it in his own hand, and one last lock is all that stands between you and his throne.",
    },
  },
  {
    // Tumbler Lock. Rush Hour on the throne gate's great lock. Stages
    // validated by web/verify-tumbler.mjs (min slides 7 / 11 / 18 vs budgets
    // 12 / 16 / 26). KEEP THE SCRIPT IN SYNC when editing stages.
    id: 'throne_gates',      type: 'puzzle',
    label: 'The Throne Gates',
    flavor: "The don's gate is one great lock: iron bars over iron bars, and a single gold bolt that only runs when every tumbler stands clear. Nobody knocks.",
    bridge: 'The last tumbler throws and the gates swing on silence. Past them: the deepest water there is, and the don sitting in it.',
    requiresNode: 'crooked_ledger',
    puzzle: {
      kind: 'tumbler',
      rewardNavXp: 1000,
      reveal: 'The bolt runs free and the gates part.\nNo horns, no guns. The don knew you were coming the whole way down.',
      tumbler: {
        stages: [
          { moveBudget: 12, grid: [
            'AA...O',
            'P..Q.O',
            'PZZQ.O',
            'P..Q..',
            'B...CC',
            'B.RRR.',
          ]},
          { moveBudget: 16, grid: [
            '..CCC.',
            '..IAD.',
            'ZZIADE',
            'B..AGE',
            'BFF.G.',
            'HHH...',
          ]},
          { moveBudget: 26, grid: [
            'G..BDD',
            'G..BI.',
            'ZZE.I.',
            '..EAC.',
            'HHHAC.',
            'FFF...',
          ]},
        ],
      },
    },
    detail: {
      description:
        'Three tumblers, each a lattice of iron bars over one gold bolt. Bars slide along their grooves, never sideways, and the bolt only runs when its whole row stands clear to the edge. Throw all three within the slide budget; run out and the tumbler resets to its first set.',
      dropsNote: 'Throwing the gate pays Nav XP. The budget resets the tumbler, never the gate. Read the bars before you slide.',
      ctaLabel: 'Work the Lock →',
    },
  },
  {
    // Ch4 finale lead-in +1: the gates part into the don's own water. His court
    // is arrayed; the crew reads the enemies (heavy legendary banter); his
    // consigliere the Closer glides out as his mouthpiece with the warning.
    // No back-to-back story. Throne_gates (puzzle) precedes, the muster follows.
    id: 'the_drowned_court',   type: 'story',
    label: 'The Drowned Court',
    flavor: "The gates open on the deepest water there is, and the don's court rides at anchor around one lit flagship. Six apex killers arrayed like courtiers, the most dangerous crew in the sea, and the biggest name in it sitting still at the center of them.",
    bridge: "The court knows your name now. His right hand has promised, in his voice, that you will not leave this water. Past him, the aisle to the throne stands open.",
    requiresNode: 'throne_gates',
    image: '/raidlog.png',
    sceneAccent: '#dc2626',
    scene: [
      { text: "The last gate swings on silence and you slip into the don's own black water. No horns. No warning shot. Just the pressure of the deep and one lit flagship far ahead, ringed by its court." },
      { text: "Six hulls ride at anchor around it, arrayed like courtiers around a throne. Each flies the shark colors. Each, on any other water, would have been the thing you came to sink." },
      { ...GUIDE.mira, text: "Look at them. A Render. A Reaper. The don's own Closer, by the scars on that one. Every single one a bounty I'd have crossed an ocean for on its own. And they're only the DOOR." },
      { ...GUIDE.doby, text: "In a long life on this water I've never seen them gathered in one place. Every hull there is a shark whole fleets tell stories about to frighten one another quiet. The don didn't hire this court. He collected it. The deadliest thing each dark corner of the sea ever spat out, all anchored in one room." },
      { ...GUIDE.mako, text: "Six of the biggest killers in the sea, and one enormous one at the back of the room. Do you have any idea how long I've wanted a table set like this?" },
      { ...GUIDE.kat, text: "Mako. That's not a table. That's the thing that eats the table, and everyone still sitting at it." },
      { ...GUIDE.dole, text: "The Closer there has put down more captains than the other five combined, and every one of those five is an apex the whole trade gave up trying to touch. Which makes it curious that he's the one peeling off the line to greet us. A court doesn't send its deadliest just to say hello." },
      { text: "One hull peels from the ring, all cold precision, and stops across your bow. Close enough to read the old scars crossing his plating like a ledger of every captain he has closed.", pause: 500 },
      { speaker: 'The Closer', portrait: THE_THRONE.enemies.the_consigliere.portrait, text: "The don sends his regards, little captain. He has read your whole story. The barnacle. The old hauler. The market. The thing on the bar. A tidy little climb." },
      { speaker: 'The Closer', portrait: THE_THRONE.enemies.the_consigliere.portrait, text: "He wanted you to hear it from me, since I keep his accounts: you will not leave this water. The line for how you sink is already written, in his own hand. You are simply the last to read it.", pause: 500 },
      { ...GUIDE.laz, text: "That's the same voice that read me my debt, a lifetime ago, in this exact water. Calm. Certain. Counting me closed before I had drawn a breath to argue." },
      { ...GUIDE.laz, text: "It was wrong about me. I am still here." },
      { ...GUIDE.doby, text: "Then let it be wrong twice. The court can talk all it likes. We came to answer." },
      { text: "The Closer holds a moment longer, as if offering you the chance to turn. You do not. He slides back into the ring, and the court parts, an aisle of guns opening straight to the throne.", pause: 600 },
    ],
    detail: {
      description:
        "The don's court rides at anchor around his lit flagship: six shark-captains, and not one a common hull. Every one is an apex killer the whole trade long ago gave up trying to touch. The deadliest crew in the sea, hand-picked by the don. His right hand, the Closer, glides out to read you his terms: he has watched your whole climb, found it quaint, and already written the line for how you sink. Then the court parts, and the aisle to the throne opens.",
      drops: [
        { emoji: '🦈', label: "The Closer's Terms", sublabel: "\"The line for how you sink is already written, in his own hand. You are simply the last to read it.\"", rarity: 'rare' },
      ],
      dropsNote: 'The don\'s court, named and arrayed. And his mouthpiece\'s promise, in his voice, that you will not leave this water.',
      ctaLabel: 'Take the Aisle →',
      summary: "Past the gates, the don's court parted for you. But not before his consigliere promised, in his name, that you would not leave this water.",
    },
  },
  {
    // Ch4 finale lead-in +2: the doorman (The Gnash) holds the aisle and counts
    // your crew. A crew-gate that maps to the Don's phase checks (brace/shield,
    // heal, snare/burst) so you arrive ready. Non-story separator between the two
    // finale story beats.
    id: 'the_last_muster',   type: 'muster',
    label: 'The Last Muster',
    flavor: "The court parts, but one hull holds the aisle: the don's doorman, The Gnash, counting your deck before it lets you through. The don does not admit a half-crewed deck to his table.",
    bridge: "The Gnash slides aside, unimpressed. Nothing stands between you and the throne now but open water.",
    requiresNode: 'the_drowned_court',
    muster: {
      minCrew: 5,
      minLevel: 65,
      // Exactly what the don's court demands across its phases: a defender for
      // the volleys (brace/shield), a mender for his jaws (heal), and someone
      // who can jam or blast him out of a dive (snare/burst).
      requires: [['brace', 'shield'], ['heal'], ['snare', 'burst']],
    },
    detail: {
      description:
        "The Gnash blocks the aisle and reads your deck. What waits at the throne answers to nothing but the right hand at the right moment: a brace or a shield when the whole court fires as one, a mender when the don's jaws find your hull, and someone who can jam or blast him out of a dive. Bring hands for all three, or the doorman turns you back.\n\nThis is the fight the Sixth Berth was built for. Field your whole crew.",
      dropsNote: 'No cost and no fight. Bring a crew that can answer the don\'s court, and the aisle opens.',
      ctaLabel: 'Stand For the Doorman →',
      summary: "The don's doorman counted your crew and found hands enough to face the throne.",
    },
  },
  {
    // Ch4 finale lead-in +3: within hail of the throne, the don himself speaks,
    // the escalation from his consigliere's warning to the apex's own taunt.
    // Legendary banter carries the crew's resolve; ends on his contemptuous
    // stillness, straight into the fight.
    id: 'within_hail',   type: 'story',
    label: 'Within Hail',
    flavor: "The aisle of guns opens onto the throne, and for the first time the don deigns to speak, almost impressed you climbed the whole ladder only to learn where it ends. Then he goes still, and the whole black sea goes still with him.",
    bridge: "The don has said his piece: you will not beat him, nothing in his water ever has. The sea lies flat as a held breath. There is nothing left between you and the biggest name in it.",
    requiresNode: 'the_last_muster',
    image: '/raidlog.png',
    sceneAccent: '#dc2626',
    scene: [
      { text: "You take the aisle. The court holds its fire and its formation, every gun tracking you in, and the lit flagship at the end grows from a lantern to a leviathan." },
      { ...GUIDE.mako, text: "Bigger than the stories. Bigger than the Cartographer swore anything in this sea could get. I didn't think I'd ever be the small one at a table." },
      { ...GUIDE.dole, text: "Everything ran up to him. Every debt, every drowned captain, every clever little sum I read off a dead captain's ledger. And here he is at the bottom of it all, exactly where the numbers said he'd be. I do hate being right about a monster." },
      { ...GUIDE.mira, text: "Hold your nerve. This is the mark no one in the trade will touch. Which means when he goes down, it's us who put him there. And no one else in the whole sea gets to say it." },
      { text: "Close enough to hail now, and the don, who has not stirred for the whole descent, finally lifts his vast head and regards you the way you would look at a coin you have already spent.", pause: 500, closeup: true },
      { speaker: 'Don Finleone', portrait: THE_THRONE.enemies.don_finleone.portrait, text: "All this way. Past my hauler, my market, my whole drowned family. I confess I am almost impressed, little captain." },
      { speaker: 'Don Finleone', portrait: THE_THRONE.enemies.don_finleone.portrait, text: "Almost. You have climbed the entire ladder to learn the one thing every captain learns too late: the ladder ends in a mouth. You will not beat me. Nothing in this water ever has. But come. Let me see how you sink.", pause: 700, fx: 'flash' },
      { ...GUIDE.kat, text: "Big words, for a fish." },
      { ...GUIDE.laz, text: "Let him talk. The drowned always sound certain, right up until the water disagrees. And it always does, in the end." },
      { ...GUIDE.doby, text: "You have the whole crew at your back and the biggest name in the sea in front of you. I've waited a long life to see a captain stand here. Take him." },
      { text: "Then the don falls still, stiller than a thing that size has any right to hold, and the court falls still with him. The whole black water holds its breath.", pause: 600 },
      { ...GUIDE.doby, text: "Steady. Something this old only goes quiet right before it moves.", pause: 400 },
    ],
    detail: {
      description:
        "The aisle opens onto the throne, and the don finally deigns to speak. Almost impressed you climbed the whole ladder, only to learn it ends in a mouth. He tells you plainly you will not beat him; nothing in his water ever has. Then he goes still, and the whole black sea goes still with him.",
      drops: [
        { emoji: '📜', label: "The Don's Word", sublabel: "\"You have climbed the entire ladder to learn the one thing every captain learns too late: the ladder ends in a mouth.\"", rarity: 'epic' },
      ],
      dropsNote: "The don's own promise, delivered face to face: you will not beat him. Time to find out.",
      ctaLabel: 'Answer the Throne →',
      summary: "Within hail of the throne, the don spoke: you will not beat him, nothing in his water ever has. Then he went still, and so did the sea.",
    },
  },
  {
    // RAID 8. The Throne. Debuts the raid-8 layer: enemy ULTIMATES at a
    // full 4-ball magazine and AIM-BAR ATTACKS (decoys / hardened / squall).
    id: 'the_throne',    type: 'raid',
    label: 'Don Finleone',
    flavor: "The court rides at anchor and the don sits still at the center of it, done talking. Every hull here carries a trick you haven't been hit with yet. And the don carries all of them.",
    bridge: "The court is drowned and the don with it. The Finndicate dies here, on its own throne, in its own black water. The biggest name in the sea, finally answered for.",
    requiresNode: 'within_hail',
    requiresNavLevel: 58,
    route: '/raids/throne',
    raidId: THE_THRONE.raidId,
    image: THE_THRONE.enemies.don_finleone.portrait,
    detail: {
      description:
        "The don's own court, and every hull in it fights with a new kind of dirty. Watch their cannonball pips: a FULL, glowing battery means an ULTIMATE is primed. Burn their charges down, shield, or brace before it empties into you. And their specials strike your AIM BAR itself: false gold you must not lock, plated locks that take two taps, squalls that gust your needle mid-sweep. Don Finleone waits at the center. And what rises when his mask drops is nothing the family ever put on a ledger.",
      enemies: ['The Ripper', 'The Render', 'The Gnash', 'The Gorge', 'The Reaper', 'The Closer', 'Don Finleone'],
      drops: lootDrops(THE_THRONE.loot),
      clearReward: clearPayout(THE_THRONE),
      dropsNote: "One crate per clear, rolled once and scaled by your Fortune. The Don's Signet is the signature chase. The ring the whole Finndicate answered to. Two stronger Tide events between fights.",
    },
  },
  {
    id: 'the_throne_challenge',    type: 'raid',
    label: 'Challenge: The Throne',
    flavor: 'The court reconvenes, and this time the don skips the pleasantries.',
    requiresNode: 'the_throne',
    route: '/raids/throne/challenge',
    raidId: THE_THRONE_CHALLENGE.raidId,
    sideBranch: { parentId: 'the_throne' },
    image: THE_THRONE.enemies.don_finleone.portrait,
    detail: {
      description:
        'The Throne again, meaner in every seat. Thicker barriers, heavier ultimates, the same aim-bar tricks with less patience between them. And the don rises twice as angry. The chase rewards roll richer.',
      enemies: ['The Ripper', 'The Render', 'The Gnash', 'The Gorge', 'The Reaper', 'The Closer', 'Don Finleone'],
      drops: lootDrops(THE_THRONE_CHALLENGE.loot),
      clearReward: clearPayout(THE_THRONE_CHALLENGE),
      dropsNote: 'Every kill pays more and the clear bonus is steeper than the normal run.',
    },
  },
  {
    // Chapter IV FINALE. One seamless post-Don beat (merged from the old
    // dons_fall + Between Watches so there's no back-to-back story node). The
    // Don sinks, the ONE deniable Finn silhouette rises and is gone, Mira pivots
    // the room from unease to victory, then the full six-hander denouement +
    // the "crew is whole, grog is cold" refrain. The silhouette is the ONLY Finn
    // hook in Ch4; everything before it read Don-as-endgame. Gates the augment.
    id: 'chapter_4_close',
    type: 'story',
    label: 'Between Watches',
    flavor: "The don's court on the seabed and a whole crew on the deck that put it there. But before the grog is even cold, something out past the wreck rises to watch, and is gone before you can be sure it was there.",
    bridge: "One tide ends. The Finndicate is drowned, the crew is whole, and whatever watched from the deep can wait for morning.",
    requiresNode: 'the_throne',
    image: '/raidlog.png',
    sceneAccent: '#a78bfa',
    scene: [
      { text: 'The megalodon goes down the way an empire does. A long time proud, and then no time at all.' },
      // The don's last words. They are the whole hinge of the finale (its node is
      // named for them), and they were never actually written down anywhere: the
      // player was being asked to remember a line nobody ever said.
      { text: 'He is still going down when he finds the breath for one more.', pause: 600 },
      { ...GUIDE.doby, text: "Let him talk. Let the sea hear him say it." },
      { speaker: 'Don Finleone', portrait: THE_THRONE.enemies.don_finleone.portrait, text: "You think you have taken something off me. I only ever held the knife, captain." },
      { speaker: 'Don Finleone', portrait: THE_THRONE.enemies.don_finleone.portrait, text: "You have not met the Hand that sharpens it." },
      { text: 'And then the court scatters, the colors strike, and generations of drowned debts sink to the bottom with the don who collected them.', pause: 500 },
      { text: "Then, out past the wreck, where the don's water spills over into the true deep, the black surface stirs. Something is watching the ruin you made, and it was never once in his court.", pause: 700 },
      { text: 'It rises just enough to throw a shape against the dark: a figure standing easy with one arm out over the water, a stance you would swear you had seen before on sunnier water, over a far shorter line.', pause: 400, fx: 'flash', insert: { kind: 'finn-silhouette' } },
      { text: 'The don was the biggest name in the sea. He was not your last fight.', pause: 900, closeup: true },
      { text: 'And something in the shape of the whole chase shifts, the way a word you have said a thousand times goes strange in your mouth. You could not say what moved. Only that it did.', pause: 700 },
      { text: 'Then the deep folds over it, and it is gone before you can be sure it was ever there at all.' },
      { ...GUIDE.mira, text: "Captain. Tell me you saw that too. ...No. Not tonight. Tonight the don's on the bottom, and that was us. The rest can keep till morning." },
      { text: 'The court settles to the seabed, and for the first time in four chapters, there is nothing ahead to point at. So the crew takes the longest watch of all. Together.', pause: 500 },
      { ...GUIDE.doby, text: "I've sailed this sea longer than any of you have drawn breath, and I never once believed I'd see the Finndicate on the bottom. Well done, small fry." },
      { ...GUIDE.kat, text: "Don't let him fool you. He's crying. Whales do that." },
      { ...GUIDE.mako, text: "The biggest bounty in the sea, collected, and I got to be there for it. I could get used to this crew." },
      { ...GUIDE.dole, text: "Four chapters, one drowned empire, and a debt the whole sea owed finally paid in full. The finest sum I ever balanced." },
      { ...GUIDE.laz, text: "The drowned can rest now. All the captains the don fed to this water. That's worth more than any coin in his vault." },
      { ...GUIDE.mira, text: "All of us, one impossible mark, and a captain with no sense of self-preservation. I've never had better odds in my life." },
      { text: "Tonight the crew is whole, the grog is cold, and the whole sea knows your name. Whatever waited out past the wreck can wait for morning.", pause: 600 },
    ],
    detail: {
      description:
        "Don Finleone is drowned and the Finndicate broken with him, the biggest name in the sea answered for. And then, out past the wreck at the lip of the true deep, a figure that was never in the don's court rises just long enough to watch, then sinks: he was not your last fight. But that is tomorrow's tide. Tonight all six of you take the longest watch together, and for once the crew is whole.",
      drops: [
        { emoji: '📜', label: "Captain's Logbook, Fragment XIV", sublabel: '"The don is drowned, and that was us. Something out past the wreck rose to watch. Tomorrow. Tonight the crew is whole."', rarity: 'epic' },
      ],
      dropsNote: 'The don falls, something out past the wreck rises to watch, and the crew takes the longest watch together.',
      ctaLabel: 'Rest a While →',
      summary: "Don Finleone is drowned and the Finndicate broken, the biggest name in the sea answered for. A figure that was never in his court rises past the wreck to watch, then sinks: he was not your last fight. But that is tomorrow. Tonight the whole crew takes the longest watch together, and the whole sea knows your name.",
    },
  },
  {
    // Chapter IV's capstone REFIT. Not a class pick: a purchasable extra
    // raid-item mount, bought once in Manage Ship (like the Sixth Berth).
    // Same berth-node mechanics, keyed on `armory` instead of `berth`.
    id: 'chapter_4_augment',    type: 'berth',
    label: "The Don's Shipwright",
    flavor: "The don kept a shipwright the way other captains keep a surgeon. He works for you now. One last refit, bolted to your deck for good.",
    bridge: 'The plans are cut and the iron is on the deck. One more mount, if you want to pay for it.',
    requiresNode: 'chapter_4_close',
    armory: { price: ARMORY_EXPANSION_COST },
    detail: {
      description:
        "The finest shipwright on the drowned market owes you his freedom, and he pays it in iron. He can cut your deck for one more RAID-ITEM MOUNT: an extra piece of gear working every fight, on every raid from here on.\n\nIt costs a fortune. Take his plans to your shipwrights in Manage Ship when you are ready to pay for it.",
      dropsNote: 'A permanent extra raid-item mount, on every raid. Bought once in Manage Ship, and it never comes off.',
      ctaLabel: 'Take the Plans →',
      summary: "The don's shipwright owes you his freedom and pays it in iron: an extra RAID-ITEM MOUNT cut into your deck for a fortune, one more piece of gear working every fight. Buy it in Manage Ship.",
    },
  },
  // ── ONE LAST RIDE ─────────────────────────────────────────────────────────
  // The convergence. Not a chapter — ONE last stop that sits outside Chapter IV,
  // after the don is in the ground and the shipwright has been paid. This is the
  // node the whole cross-game twist has been walking toward: the Finndicate's
  // real head is Finn, the fishing rival, and the only door to him is the one
  // the player opened for him by landing all six Ancient Deep giants.
  //
  // Gated on `requiresAncients: 6` — the FIRST raid node in the game that reads
  // the fishing track. That is the point: it cannot be reached from this map
  // alone (see [[finn-finndicate-twist]] — the convergence trilogy).
  // THE REVEAL. Its own story node, and the one the ancients gate hangs on —
  // landing the sixth giant should pay off with the TRUTH, not with a health
  // bar. Label is Finleone's own dying line ("I only ever held the knife. You've
  // not met the Hand that sharpens it"), so it reads as finally meeting the Hand
  // without naming Finn on the map before you have read it.
  // The scene[] + Logbook fragment land with the cutscene itself.
  {
    id: 'the_hand_that_sharpens',
    type: 'story',
    label: 'The Hand That Sharpens It',
    flavor:
      'Six giants came up out of the Ancient Deep on your line, and every one of them went somewhere. You never once asked where. The don said you had not met the Hand yet. He was right, and he was not warning you.',
    bridge:
      'The sea is very quiet now, and every quiet thing you ever pulled up out of the dark was a favour you did not know you were doing.',
    requiresNode: 'chapter_4_augment',
    // THE cross-track gate: the reveal is what the six giants buy you.
    requiresAncients: 6,
    // Visible as a GOAL while locked — hiding it would hide the reason to go
    // and land the giants in the first place.
    previewWhenLocked: true,
    image: '/raidlog.png',
    sceneAccent: '#a78bfa',
    scene: [
      { text: 'The sixth giant is on your wall, and the sea has been quiet ever since. No pirates. No fog. A whole ocean waiting on something.' },
      { text: 'Then a heading comes. Not a vault, not a fortress. Just open water in good morning light.', pause: 400 },
      { text: 'There is a small boat on it, with someone sitting in the stern and a line in the water. Whoever it is does not turn around when you come alongside.', pause: 700 },
      { speaker: 'The Angler', text: "Took you long enough. I'd about run out of water to wait on." },
      { text: 'You know that voice. You cannot place it out here, but you know it.', pause: 600 },
      { text: 'He turns around.', pause: 1000, fx: 'flash', insert: { kind: 'finn-unmasked' }, closeup: true },
      { ...GUIDE.finn, text: "Surprised? Heh." },
      { text: 'Finn.', pause: 1000, closeup: true },
      { text: 'The loudmouth off your own dock. The one who laughs at your boat every morning and tells you where the real fish are.', pause: 800 },
      { ...GUIDE.kat, text: "Finn?! *You* were behind all of this?" },
      { ...GUIDE.mako, text: "But you are... you're just a fisher. You sit on a dock all day." },
      { ...GUIDE.doby, text: "How is this possible? You orchestrated all of it? You were the one pulling the strings on someone as powerful as the don?" },
      { ...GUIDE.finn, text: "The don was a very big fish in a very small pond, and he did exactly what I paid him to do." },
      // The name is DISCOVERED, not announced. Mira has been staring at a ledger
      // for four chapters; she is the one who gets to put it together out loud.
      { text: 'Mira has not said a word. She is staring at nothing, the way she does when a number will not sit right.', pause: 800 },
      { ...GUIDE.mira, text: "The ledger." },
      { ...GUIDE.mira, text: "That one letter, signed under every crooked page of it. I told you it was a dead partner. I *swore* to you." },
      { ...GUIDE.mira, text: "F." },
      { text: 'And you watch it land on her.', pause: 1000, closeup: true },
      { ...GUIDE.mira, text: "...Oh no. No, no, no. The F. The *Finn*dicate. It has had his name written on it the entire time." },
      { text: 'Nobody says anything at all for a moment.', pause: 900 },
      { ...GUIDE.finn, text: "The lot of you. Chasing it up the ladder that whole way, and not one of you ever once said it out loud. Most never do. Not until it is far too late to help them." },
      // WHY. He wants them to understand exactly how it worked.
      { ...GUIDE.finn, text: "You want to know why. Everyone does, right at the end." },
      { ...GUIDE.finn, text: "The ancients. That is all any of it was ever for." },
      { ...GUIDE.finn, text: "Every shipment. Every crooked cargo. Every captain I bought and every hold I filled. All of it was gear and coin and charts, spent finding the old ones and trying to reach them." },
      { ...GUIDE.doby, text: "The whole Finndicate. Generations of it. That was your *tackle box*." },
      { ...GUIDE.finn, text: "A whole lifetime of my own poured into it, and the deep still would not let me near them." },
      { ...GUIDE.finn, text: "It will not open for me. It never has. So I needed someone it *would* open for." },
      { text: 'He looks at you the way he looks at a good catch.', pause: 700, closeup: true },
      { ...GUIDE.finn, text: "You tore through my captains like they were nothing. Every one I put in your way. That alone would have been worth watching." },
      { ...GUIDE.finn, text: "But then you kept fishing. You put in the hours, you got good, and you got good enough to land what sleeps down there. Six for six." },
      { ...GUIDE.finn, text: "I did not think anything in this ocean could do both. You impressed me, captain. Truly." },
      { text: 'It is the first honest thing he has said, and somehow it is the worst one.', pause: 800 },
      { ...GUIDE.finn, text: "So I let you run. Every door you kicked down, I left unlocked. You cleared out my own house and called it a campaign, and you got sharper every time you did it." },
      { ...GUIDE.kat, text: "Captain. Whatever he wants, he is not getting it." },
      { ...GUIDE.finn, text: "You're carrying them right now. Did you never wonder why they never rotted?" },
      { text: 'He lifts one hand, and the six of them come up out of your hold on their own.', backdrop: '/scenes/harvest-ring.jpg', pause: 800, insert: { kind: 'ancient-harvest' } },
      { text: 'They hang in a ring around him, turning slow, the way they must have turned down in the dark.', pause: 850 },
      { text: 'Then, one at a time, in the order you caught them, the power goes out of them and into him.', pause: 900, fx: 'shake' },
      { ...GUIDE.doby, text: "He's ABSORBING them. Those slept down there before there were charts to leave them off, and he is taking every last thing they had." },
      { text: 'The sea flattens. Every wave for a league around lies down at once, like the water is holding still to let it happen.', pause: 800, fx: 'shake' },
      { ...GUIDE.mako, text: "The hold. Captain, the hold is EMPTY." },
      { text: 'What comes down on the water afterward is only the shape. Grey and light and wrong, like driftwood.', pause: 700 },
      { ...GUIDE.finn, text: "Finally." },
      { ...GUIDE.finn, text: "A lifetime of waiting. *Finally.* The power I have been longing for." },
      { text: 'Something goes wrong with the way he is standing there.', pause: 900, insert: { kind: 'finn-becoming' }, closeup: true },
      { text: 'The colour drains out of him first. Then the shape starts to go, and what is left of it will not hold still.', pause: 1100, fx: 'shake', closeup: true },
      { text: 'He gets bigger. Not all at once. The way a swell gets bigger, when you already know it is going to break over you.', pause: 1100, closeup: true },
      { text: 'Light opens along him in cracks, like something inside is too big for the shell it borrowed.', pause: 1000, fx: 'flash', closeup: true },
      { text: 'The morning goes white, and then it goes dark from him outward.', backdrop: '/scenes/morning-undone.jpg', pause: 1000, fx: 'flash', insert: { kind: 'finn-sinister' }, closeup: true },
      { text: 'A lifetime of dockside angler was a costume. This is what was wearing it.', pause: 1000, closeup: true },
      { ...GUIDE.mako, text: "No... no, it can't be..." },
      { ...GUIDE.mira, text: "All this time we thought we had wiped the Finndicate off the sea. Every captain, every cache, every ledger. It was him. It was only ever him." },
      { ...GUIDE.laz, text: "I have been drowned, captain. I know what the deep feels like. It is standing in front of us." },
      { ...GUIDE.doby, text: "I have swum this sea longer than any of you have drawn breath, and I have never felt anything like that. There is nothing left in this ocean that can close this." },
      { ...GUIDE.finnFinal, text: "Ah. There it is." },
      { text: 'The water pulls back from the boat. Even the deep is giving him room.', pause: 800 },
      { ...GUIDE.finnFinal, text: "Every cold thing at the bottom of this ocean answers to me now. I can feel the whole of it, all the way down, like it is sitting in my hands." },
      { ...GUIDE.finnFinal, text: "Six keys, and the door is open, and I am already through it. You did that. Remember that you did that." },
      { ...GUIDE.finnFinal, text: "And I want it said plainly, in front of your whole crew, because you have earned the hearing of it." },
      { ...GUIDE.finnFinal, text: "You hunted them. You hauled them up out of the dark one at a time. You carried them in your own hold and kept them safe for me the entire way." },
      { ...GUIDE.kat, text: "Captain. Do not let him talk." },
      { ...GUIDE.finnFinal, text: "The finest crew that ever put out of that harbour, and every hour of it went into earning me this. Thank you. Truly. You have my gratitude, for whatever you think that is worth out here." },
      { ...GUIDE.laz, text: "He is thanking us." },
      { ...GUIDE.finnFinal, text: "It was always going to be mine. You just did the rowing." },
      { ...GUIDE.finnFinal, text: "You'll come after me. You have never once done the sensible thing, and I built all of this on it." },
      { ...GUIDE.finnFinal, text: "One last ride, then. You and me and the deep. You'll be on time. You always are." },
      { text: 'The dark holds where the morning was. Six grey shapes turn slow circles on the water.', pause: 600 },
      { text: 'You came out here for the last name on the board. You have had it since the day you started.', pause: 700 },
    ],
    detail: {
      description:
        'The last stop is not on any chart the Finndicate kept. It opens for a captain who has been down where the old things sleep, and it opens for nobody else.\n\nThat was always the point.',
      drops: [
        // NO PUN HERE. This node previews while locked, so its drop tiles are
        // readable before the scene plays — and this sublabel used to spell out
        // "Finn-dicate", which is the exact beat the cutscene builds to (Mira
        // lands it after the unmask). The tile was telling the twist to anyone
        // who tapped a node they had not unlocked. Keeps the menace, drops the
        // reveal; the scene still delivers it.
        { emoji: '📜', label: "Captain's Logbook, Fragment XV", sublabel: '"Everyone hears the name eventually. Never once before it is too late to matter."', rarity: 'legendary' },
      ],
      dropsNote: 'The name at the top of the Sunken Hand, and what your six giants were really for.',
      ctaLabel: 'Pull Alongside →',
      summary:
        'What the six giants were really for. Opens only once every Ancient Deep trophy is on your wall.',
    },
  },
  // THE FIGHT. Named for the saga itself: the Sunken Hand, at last, in person.
  {
    id: 'one_last_ride',
    type: 'raid',
    label: 'The Sunken Hand',
    flavor:
      'No ledger, no lieutenant, no don between you. Just the water, a long quiet line, and the angler on the other end of it who has been reeling the whole time.',
    requiresNode: 'the_hand_that_sharpens',
    raidId: THE_SUNKEN_HAND.raidId,
    route: '/raids/sunken-hand',
    previewWhenLocked: true,
    image: '/finn_final.png',
    // Revealed only AFTER the reveal scene. This was an unconditional
    // `revealBoss: true` on the reasoning that the previous node is the
    // reveal — true for someone who cleared it, but the node previews
    // while locked and the Bosses tab lists it either way, so it was
    // un-telling the twist to everyone who had not got there yet.
    revealBossAfter: 'the_hand_that_sharpens',
    sceneAccent: '#a78bfa',
    detail: {
      description:
        'One last ride, captain. Everything the Sunken Hand ever took, and everything it opened for you, comes down to this water.',
      enemies: ['The Hand itself (six phases)'],
      drops: lootDrops(THE_SUNKEN_HAND.loot),
      clearReward: clearPayout(THE_SUNKEN_HAND),
      dropsNote: 'Everything the six giants gave him, taken back off his hull.',
      ctaLabel: 'Coming Soon',
      summary: 'The last fight. Read The Hand That Sharpens It first.',
    },
  },
  // THE CLOSER. The kill happens in the raid; this is the only place the saga
  // gets to LAND. Deliberately short after the fight and deliberately quiet at
  // the end: four chapters of escalation earn a scene that stops escalating.
  //
  // The foreshadow is one line from Doby, buried mid-conversation and never
  // answered. It has to be missable on a first read — a promise here would
  // cheapen an ending the player just spent a campaign earning.
  {
    id: 'the_long_quiet',
    type: 'story',
    label: 'The Long Quiet',
    flavor:
      'The water where he stood will not hold a wave. Your crew are still braced for a fight that is already over, and nobody has said anything yet.',
    bridge:
      'Six giants went into him. They are coming back out, and the sea is taking them home.',
    requiresNode: 'one_last_ride',
    previewWhenLocked: false,
    image: '/finn_final.png',
    sceneAccent: '#a78bfa',
    scene: [
      { text: 'The last shot lands, and nothing happens for a moment.', pause: 900 },
      { text: 'Then his hull gives. Not split, not burned. It simply stops arguing with the sea.', pause: 800, insert: { kind: 'finn-undone' } },
      { text: 'It goes over slow, the way a big thing goes over, and the water closes on it without a sound.', pause: 900, fx: 'shake' },
      { ...GUIDE.finnFinal, text: "...impossible." },
      { text: 'He is still standing. He is standing on nothing at all, and he has not noticed.', pause: 900, closeup: true },
      { ...GUIDE.finnFinal, text: "How could you defeat me...?" },
      { text: 'The light that was running under his skin turns and starts going the other way.', pause: 850, fx: 'flash', closeup: true },
      { text: 'It leaves through the same cracks it opened. Six of them, one at a time, in the order you caught them.', pause: 1000, closeup: true },
      { ...GUIDE.finnFinal, text: "I had all of it. Every cold thing at the bottom of this ocean. I had it in my *hands*." },
      { ...GUIDE.finnFinal, text: "A lifetime. I gave a whole lifetime to the waiting..." },
      { text: 'He looks at you the way he did on the dock, every morning, for years.', pause: 950, closeup: true },
      { ...GUIDE.finnFinal, text: "...you were never supposed to be better than me at this." },
      { text: 'And then there is nothing there to look back at.', pause: 1200, fx: 'flash', closeup: true },
      { text: 'What is left of him goes up rather than down, grey and weightless, and the wind takes it apart before it clears the mast.', pause: 1000 },

      // THE COSTUME COMES OFF LAST. He does not die as the thing he became.
      { text: 'And then the water is quiet, and there is a small boat sitting on it.', pause: 1000, insert: { kind: 'finn-remains' } },
      { text: 'Someone is in the stern, the way someone was the first morning you came alongside. No colour to him. No weight to him either.', pause: 1000, closeup: true },
      { ...GUIDE.finn, text: 'Heh.' },
      { ...GUIDE.finn, text: "Would you look at that. All of it gone, and this is what's left underneath." },
      { text: 'It is just Finn. The loudmouth off your dock, sat in his own little boat with no line in the water.', pause: 1000, closeup: true },
      { ...GUIDE.mako, text: 'Captain... he looks like he used to.' },
      { ...GUIDE.finn, text: "I was, once. Same as you." },
      { ...GUIDE.finn, text: "I too was just an angler at first..." },
      { text: 'He is going. You can see the light through him now.', pause: 1000, closeup: true },
      { ...GUIDE.finn, text: "...don't let it get to you too..." },
      { text: 'Nobody asks him what he means. There is nobody left in the boat to ask.', pause: 1200, closeup: true },
      { text: 'It rides there empty for a moment, level and unhurried, and then the sea takes that as well.', pause: 1100 },
      { text: 'The sea comes back in. One long swell rolls through where he was, and the ocean is just an ocean again.', backdrop: '/scenes/long-quiet.jpg', pause: 1000 },
      // The crew, coming down. Nobody makes a speech.
      { text: 'For a while your crew just stand there, still braced.', pause: 900 },
      { ...GUIDE.kat, text: "...Is that it? Is it done?" },
      { ...GUIDE.mira, text: "The ledger's shut. Every page of it traced back to one name, and that name is not in the water any more." },
      { ...GUIDE.mako, text: "He sat on that dock. He watched us leave every single morning. He waved." },
      { ...GUIDE.laz, text: "He waved at me too. I always thought he was being friendly." },
      { ...GUIDE.kat, text: "He was. That was the worst part of him." },
      { text: 'Somebody laughs. It is not a good laugh, but it is a real one, and it lets the rest of them breathe.', pause: 800 },
      { ...GUIDE.mira, text: "Captain. The six are gone from the hold. Properly gone, this time." },
      { ...GUIDE.doby, text: "Not gone. Home." },
      { text: 'Doby is looking down, past the boat, at water that has no bottom worth speaking of.', pause: 900, closeup: true },
      { ...GUIDE.doby, text: "The deep gave them up for him because he asked with your hands. It has them back now." },
      // ── THE FORESHADOW. One line, unanswered, and the scene moves on. ──
      { ...GUIDE.doby, text: "Something down there let go of them twice, captain. Once for him, and once just now." },
      { ...GUIDE.doby, text: "I would not call that an empty ocean." },
      { text: 'Nobody picks it up. The light is good and the water is flat and everyone is very tired.', pause: 1000 },
      { ...GUIDE.kat, text: "Then we go home. That's the whole plan. We go home." },
      { ...GUIDE.mako, text: "I could sleep for a week." },
      { ...GUIDE.laz, text: "You have slept for a week. Twice." },
      { text: 'The crew turn the boat around without being told, the way they have a hundred times.', pause: 850 },
      { text: 'Behind you the water lies down flat and stays that way, all the way to the horizon.', pause: 900 },
      { text: 'You came out here for the last name on the board. There is nothing written on it now.', pause: 1000 },
      { text: 'It is a long quiet ride back, and every hour of it is yours.', pause: 900 },
    ],
    detail: {
      description:
        'The Sunken Hand is closed. The name at the top of it is not in this ocean any more, and the six he took have gone back down where you found them.\n\nWhat he left behind is still on the water, and it will still fit a captain who knows what to do with it.',
      drops: [
        { emoji: '📜', label: "Captain's Logbook, Final Entry", sublabel: '"Fair weather the whole way home. Crew asleep on the deck, all of them, in the sun. Nothing on the horizon. Writing it down so I remember that it happened."', rarity: 'ancient' },
      ],
      dropsNote: 'The end of the Sunken Hand, and the last page of the log.',
      ctaLabel: 'Let It Go Quiet →',
      summary: 'The end of it. Then take what he left behind.',
    },
  },
  {
    // THE SPOILS. Sits between the kill and the challenge: you beat him, you
    // take one of the two things he was carrying, and the other stays on the
    // table at a price. Deliberately NOT a power node in the normal sense, since
    // each slot fits exactly one item and that item only drops from him.
    id: 'spoils_of_the_hand',
    type: 'spoils',
    label: 'The Spoils of the Hand',
    flavor: 'Two things came up off his wreck, and only one of them will fit aboard today. The other keeps.',
    bridge: 'One is a reel. One is a mount. Both were his, and neither was meant for you.',
    requiresNode: 'the_long_quiet',
    spoils: { price: SPOILS_PRICE },
    previewWhenLocked: true,
    image: '/finn_final.png',
    sceneAccent: '#c4a96a',
    detail: {
      description:
        "He went down with two things worth taking, and they answer to the two halves of your life out here.\n\nTHE DEEP REEL opens a SECOND special slot on your fishing rig, and only The Primeval Eye will seat in it.\n\nTHE SIXTH MOUNT frames one more raid item onto your hull, and only The Primeval Maw will mount there.\n\nNeither tool is in your hold yet. This opens the berth. The wreck still has to give the piece up.\n\nTake one now. The other keeps, and it keeps expensive.",
      // Was 'Coming Soon' from before the spoils shipped -- on a node that is
      // fully live, that alone reads as unfinished.
      ctaLabel: 'Take your pick',
      summary: 'Choose one of his two spoils. The other costs 2,500,000 doubloons.',
      dropsNote: 'Each slot fits exactly one item, and that item only ever drops from him.',
    },
  },
  {
    // CHALLENGE: only opens once he is already dead. There is no story past
    // this, so it is pure post-game: the same six phases with everything turned
    // up, for players who want the fight again on worse terms.
    id: 'one_last_ride_challenge',
    type: 'raid',
    label: 'Challenge: One Last Ride',
    flavor: 'He is still down there, and the water still remembers the shape of him. Go again, with none of the mercy.',
    requiresNode: 'one_last_ride',
    route: '/raids/sunken-hand/challenge',
    raidId: THE_SUNKEN_HAND_CHALLENGE.raidId,
    sideBranch: { parentId: 'one_last_ride' },
    previewWhenLocked: true,
    image: '/finn_final.png',
    // Same gate: this previews while locked too.
    revealBossAfter: 'the_hand_that_sharpens',
    sceneAccent: '#a78bfa',
    detail: {
      description:
        'Six phases, six stolen giants, and a chain you cannot afford to drop. Everything he does hits harder and his own rhythm is tighter, so the Perfect Streak stops being a reward and starts being the requirement.',
      enemies: ['The Hand itself (six phases)'],
      drops: lootDrops(THE_SUNKEN_HAND_CHALLENGE.loot),
      clearReward: clearPayout(THE_SUNKEN_HAND_CHALLENGE),
      dropsNote: 'His uniques roll at double the normal rate.',
    },
  },
  // The Davy Jones Gauntlet used to sit here as a chapter-2 side branch.
  // It's now a permanent top-level entry point. The "Gauntlets" hub card
  // on the Expeditions page (HubCards.tsx). So it no longer lives in the
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
/** Is this boss's identity known to the player? Cleared bosses always are; the
 *  rest depend on whether the story has introduced them yet. Kept here so the
 *  Bosses tab and the fight modal cannot answer it differently. */
export function bossIdentityRevealed(node: RaidNode, clearedNodeIds: Set<string>): boolean {
  if (node.revealBoss === true) return true
  if (node.revealBossAfter) return clearedNodeIds.has(node.revealBossAfter)
  return false
}

/** WHERE A DROP COMES FROM, as somewhere you can actually go.
 *
 *  The forge planner walks a build down to its base drops and, until now, could
 *  only name the source in words: "Barnacle Pete's Raid". Knowing the name and
 *  then having to go find the fight yourself is the boring half of the answer.
 *
 *  Two kinds of destination, because the sources genuinely differ:
 *    'boss'    — a campaign raid, so open its boss card and let the player read
 *                the drops and records before committing to the fight.
 *    'route'   — a Gauntlet. There is no boss card for a run you descend, so it
 *                goes straight to the entrance.
 *
 *  ALL_RAIDS is exhaustive by construction (raidRegistry exists precisely so the
 *  server can answer "could this raid have dropped this?"), so the loot lookup
 *  cannot silently miss a campaign item. The Gauntlet fallback keys off the def's
 *  own `source` string rather than a hand-written item list, so a new Gauntlet
 *  drop links itself with no change here. */
export interface ItemSourceLink {
  kind: 'boss' | 'route'
  /** For 'boss': the RAID_MAP node whose card should open. */
  nodeId?: string
  /** For 'route': where to send them directly. */
  route?: string
  /** What to call the destination on the button. */
  label: string
}

export function raidSourceForItem(itemId: string): ItemSourceLink | null {
  // A campaign raid first. Prefer the NORMAL variant: a challenge drops the same
  // things but is the harder door, and nobody farming a component wants to be
  // pointed at the hard version of a fight they may not have cleared.
  const dropping = ALL_RAIDS.filter(r => r.loot.some(l => l.id === itemId))
  const normal = dropping.find(r => !r.raidId.endsWith('_challenge')) ?? dropping[0]
  if (normal) {
    const node = RAID_MAP.find(n => n.raidId === normal.raidId)
    if (node) return { kind: 'boss', nodeId: node.id, label: node.label }
  }
  // Otherwise a Gauntlet, read off the item's stated source.
  const src = RAID_ITEMS.find(i => i.id === itemId)?.source ?? ''
  if (/don'?s gauntlet/i.test(src))       return { kind: 'route', route: '/raids/dons-gauntlet', label: "Don's Gauntlet" }
  if (/davy jones gauntlet/i.test(src))   return { kind: 'route', route: '/raids/gauntlet', label: 'The Davy Jones Gauntlet' }
  return null
}

/** Is this node a CHALLENGE VARIANT: a side branch hanging off a boss?
 *
 *  Every UI that special-cases challenges was testing `node.sideBranch` on its
 *  own, which reads as "is this a challenge" and is not. A side branch means
 *  "draw me beside my parent instead of below it", nothing more. What makes a
 *  node a challenge is that its parent is the FIGHT it is a harder version of.
 *
 *  The Quartermaster's Ghost is the node that tells them apart. He is a side
 *  branch off a MUSTER, because that is where he unlocks, not because he is a
 *  harder muster. Every surface that assumed otherwise got him wrong: the
 *  journey spine dropped him as a duplicate of a boss banner that does not
 *  exist, and the fight modal opened his parent, drawing a boss card whose
 *  "Normal" mode was an inspection with no art, no drops and no fight.
 *
 *  Static, because it asks about the SHAPE of the map, which no player changes. */
export function isChallengeVariant(nodeId: string): boolean {
  const node = RAID_MAP.find(n => n.id === nodeId)
  if (!node?.sideBranch) return false
  const parent = RAID_MAP.find(n => n.id === node.sideBranch!.parentId)
  return !!parent && isCombatNode(parent.type)
}

/** Should this boss appear in the Bosses roster at all?
 *
 *  Ordinary bosses DO show while locked, as a masked silhouette — that is the
 *  point of the tab, a wall of who is still ahead of you. But a boss gated by
 *  `revealBossAfter` is one whose EXISTENCE is the spoiler: a "???" tile in the
 *  ninth slot still tells you there is a ninth boss and that the campaign is
 *  not over. Those are omitted outright until the story introduces them. */
export function bossListedInRoster(node: RaidNode, clearedNodeIds: Set<string>): boolean {
  if (!node.revealBossAfter) return true
  return clearedNodeIds.has(node.revealBossAfter)
}

/** Is this node's own art safe to show? A `revealBossAfter` node keeps its map
 *  position (it is the goal that motivates the run-up, so hiding it would hide
 *  the reason to go land the giants) but NOT its portrait — node.image is the
 *  boss's face, and on the finale that face is the twist. Callers fall back to
 *  the generic type glyph when this is false. */
export function nodeArtRevealed(node: RaidNode, clearedNodeIds: Set<string>): boolean {
  if (!node.revealBossAfter) return true
  return clearedNodeIds.has(node.revealBossAfter)
}

export function computeRaidMap(
  cleared: Set<string>,
  doubloons: number,
  navLevel: number,
  isAdmin = false,
  /** How many Ancient Deep giants the player has landed — feeds requiresAncients. */
  ancientsCaught = 0,
): RaidNodeView[] {
  // adminOnly nodes are hidden entirely for non-admins (the chain just ends
  // before them) while content is in review.
  return RAID_MAP.filter(node => isAdmin || !node.adminOnly).map(node => {
    if (cleared.has(node.id)) {
      return { node, status: 'cleared' as const, claimable: false }
    }
    // Coming-soon takes precedence over normal lock-reason resolution. The node
    // is intentionally inaccessible while content lands, not blocked by player
    // progression: it stays locked even when the player has met every prereq +
    // Nav requirement. ADMINS PASS THROUGH, so unfinished content can be walked
    // and reviewed in place (the same courtesy adminOnly already gives) while
    // everyone else still sees "Coming soon".
    if (node.comingSoon && !isAdmin) {
      return { node, status: 'locked' as const, claimable: false, lockReason: 'Coming soon' }
    }
    const prereqOk = !node.requiresNode || cleared.has(node.requiresNode)
    const gateOk = !node.requiresClearedNode || cleared.has(node.requiresClearedNode)
    const navOk = !node.requiresNavLevel || navLevel >= node.requiresNavLevel
    // The Ancient Deep gate. Reported LAST and in its own words: this is not a
    // progression wall the player can grind past on this map, it is a pointer at
    // the other half of the game, so the reason has to say so plainly.
    const ancientsOk = !node.requiresAncients || ancientsCaught >= node.requiresAncients
    if (!prereqOk || !gateOk || !navOk || !ancientsOk) {
      const req = RAID_MAP.find(n => n.id === (prereqOk ? node.requiresClearedNode : node.requiresNode))
      const verb = req?.type === 'story' ? 'Read' : 'Clear'
      // The chain gate is reported first and always in the derived words, so a
      // node still on its way up the spine hears about the stop in front of it
      // rather than about a gate two steps further out.
      const gateSentence = (prereqOk && !gateOk && node.gateLockNote)
        ? node.gateLockNote
        : `${verb} ${req?.label ?? 'the previous stop'} first`
      const reason = (!prereqOk || !gateOk)
        ? gateSentence
        : !navOk
          ? `Reach Navigation Level ${node.requiresNavLevel}`
          : `Land all ${node.requiresAncients} Ancient Deep giants (${ancientsCaught}/${node.requiresAncients})`
      return { node, status: 'locked' as const, claimable: false, lockReason: reason }
    }
    const claimable = node.type === 'milestone' && !!node.milestone && doubloons >= node.milestone.amount
    return { node, status: 'available' as const, claimable }
  })
}


// ── Campaign card showcase ──────────────────────────────────────────────────

export type ShowcaseBoss = {
  id: string
  name: string
  /** The boss's own portrait, transparent PNG on Supabase storage. */
  portrait: string
  /** The location he is fought in, escalated for the showdown. Same lookup the
   *  boss node card uses, so the hub tile is that card at a glance. */
  backdrop: string | null
}

/** The boss the Campaign hub tile wears: one you have already put down,
 *  picked at random so the card is different on different days.
 *
 *  Cleared only. Showing one you have not met would spoil him, and showing one
 *  you cannot reach would be a boast about somebody else's campaign. Challenge
 *  reruns are excluded because they are the same boss twice, and a card that
 *  said "Challenge: The Blockade" would be naming a mode rather than a body.
 *
 *  Before your first kill it is Barnacle Pete, who is the whole point of the
 *  opening chapter and the one boss a brand new captain has actually been told
 *  about. */
export function pickShowcaseBoss(views: RaidNodeView[]): ShowcaseBoss {
  const beaten = views.filter(v =>
    v.status === 'cleared'
    && v.node.type === 'raid'
    && !!v.node.raidId
    && !!v.node.image
    && !v.node.label.startsWith('Challenge:'))

  const chosen = beaten.length > 0
    ? beaten[Math.floor(Math.random() * beaten.length)]
    : null

  if (chosen) {
    const raidId = chosen.node.raidId as string
    return {
      id: chosen.node.id,
      name: chosen.node.label,
      portrait: chosen.node.image as string,
      backdrop: RAID_BOSS_BG[raidId] ?? RAID_LOCATION_BG[raidId] ?? null,
    }
  }

  return {
    id: 'pete',
    name: 'Barnacle Pete',
    // Named outright: BroadsideEnemy.portrait is optional, and the one
    // fallback in the game must not be able to resolve to undefined.
    portrait: ENEMY_IMG_BASE + 'barnacle_pete.png',
    backdrop: RAID_BOSS_BG[CORSAIRS_RECKONING.raidId] ?? null,
  }
}
