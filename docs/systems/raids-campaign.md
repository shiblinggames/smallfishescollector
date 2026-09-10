# Raids — Combat & Campaign Map

Turn-based ship combat along a chaptered node chain. The other half of Expeditions.

## Two surfaces, one campaign

`/expeditions` has the node map (`RaidsSection`); `/sea` has the water the same nodes are
laid on. **`lib/raidMap.ts` is the source of truth for both** — what a node is, what it
costs, what it drops — and the water is a second way to REACH those nodes, never a second
definition of them.

Everything a node needs to be finished now exists on both. See
[ocean-hub.md](ocean-hub.md) for the table of node kinds and their sea bodies, the
celebration overlays, and Captain's Orders. Two rules that came out of building it:

- **Any story node with a `payoff` must be CLAIMED (`claimScoutDebt`), not read.**
  `markStoryNodeRead` marks it cleared and grants nothing, and the claim is idempotent on a
  cleared node — so reading a payoff beat destroys its reward silently.
- **A new node kind means a new body in `SeaNodeSheet`.** `check-islands` fails until it
  has one; fifteen kinds shipped placed-but-unfinishable and nothing said a word.

## Files

- **`web/lib/raidMap.ts` — the campaign spine.** Node chain, story nodes, gates. Story
  nodes need a `scene[]`. Largest design surface in lib/.
- **`web/app/(app)/raids/RaidCombat.tsx` — the combat engine.** One large file; the
  turn loop, playback FX, HP bars (incl. overheal split), aim bar.
- Registry/loot/affixes/progress: `web/lib/raidRegistry.ts`, `raidItems.ts`,
  `raidLoot.ts`, `raidAffixes.ts`, `raidProgress.ts`, `raidChallenge.ts`
- Mid-raid roguelike interrupts: `web/lib/tides.ts`. Status effects: `web/lib/statuses.ts`.

## Losing costs the sail back, and nothing else

**There is no repair fee.** Sinking used to owe a tier-scaled doubloon bill (`raidRepairCost`,
`reportRaidSink`, `repairShip`), and until it was paid every raid route redirected to
/expeditions, every boss card refused, and the sheet on the water returned an error. All of it
is gone — the actions, the cost table, the guards on ~22 routes, the ShipHero banner and the
RepairBlockedModal. The `raid_repair_owed` column still exists and nothing reads it.

That penalty was built for a menu of raids: when the campaign was a page of cards, the only
thing a loss could take was money. **The world charges the trip instead.** `RaidGame` fires
`onSunk`, the chart catches it, and when the fight closes you are put at the Gunwharf's
berth — the ship is kept there, so it is where you come to — with everything between you and
that boss to sail again.

Two properties that matter: a captain who has just lost is asked to **try again**, not sent
away to earn the right to; and the cost scales with how far out you were, which a flat fee
never did. On the legacy `/raids` routes `onSunk` has no host and nothing happens, which is
correct — there is no sea under those to sail back across.

## Combat rules that are LAWS (each encodes a shipped bug or a confirmed feel)

- **Damage has ONE source: `raidDamageProfile`.** It was duplicated once and drifted.
  Any new damage math goes through it.
- **Aim is RAW WYSIWYG with zero rewind.** The moving zone stays; where the needle is
  when you tap is what you get. No settle animation that changes the result.
- **The inline aim bar swaps INLINE with the LogBox and their dimensions must match** —
  a size mismatch shifts the whole battle column mid-turn.
- **Opening-shield sources SUM** (`fightShield`), never `Math.max`. Stacking is the
  reward for stacking sources.
- **Freeze suppresses reactive abilities INCLUDING dodge.** A frozen enemy doesn't slip.
- **Reload at MAX becomes fire (or a feint-dodge chance)** — holding reload at full is
  never a dead turn.
- **A raid clear persists at the KILL, not at loot-claim.** Closing the tab on the loot
  screen must not cost the clear.
- **Telegraphed enemy moves are answered by crew abilities** (mechanic checks). New
  mechanics (Mist Veil fogging the aim bar, Riposte parry, enemy barriers) follow this
  pattern: dormant until an enemy uses them, answered by a specific crew class.
- **Progressive reveal is intentional** — the map fogs past `REVEAL_AHEAD`. Don't
  "helpfully" show the whole chain.
- **A heal cap is DERIVED FROM ITS RATE, never a flat number.** Every
  damage-scaled heal (Leviathan's Hunger, the Blood Cannon family, Feeding
  Frenzy, the overkill boon) shares one per-hit ceiling in `RaidCombat.tsx`:
  a fixed multiple of your total rate, as a share of max HP
  (`lifestealHealCap` / `LIFESTEAL_CAP_PER_RATE`). Two reasons, both learned
  the hard way. A flat ceiling silently deletes the effect once damage outgrows
  the hull — a real depth-96 run realised barely a fifth of the rate its own
  card advertised, because every big hit was shaved to the same number. And
  any ceiling that ignores the rate makes every point above it worthless, so
  stacking sources buys nothing. Deriving it from the rate means each source
  raises the heal AND the ceiling together, so a bigger stack always pays. The
  separate `LIFESTEAL_CAP` bounds the summed ratio and is what keeps the
  dedicated sustain build short of unkillable.

## The deck on a desktop

`useRoomy()` (900px) is the "there is screen either side of the fight" signal, distinct from
the column's own 742. Four things read it or the column:

- **The crew rail.** `CrewRail` puts every deployed crew's face in a row on the line ABOVE
  the log panel, at the column's left edge — the mirror of where the player's card docks, on
  the right of the same line. Lit with a breathing rim when ready, greyed and struck through
  when spent, and a click fires the ability directly. Two rules it has to obey:
  it is `position: absolute` at `bottom: 100%` of the deck container, OUT of the flow,
  because the deck's top edge is what the player's card measures against and a rail in the
  flow would push that card up by its own height; and it is mounted in the deck rather than
  in `ActionMenu`, because the menu is swapped for the Lock button while you aim and a rail
  inside it would vanish every time you took a shot. `specialItems` is hoisted out of the
  ActionMenu props for the same reason: two things read it now.
  The faces are `objectPosition: top center` in a 68px circle. `crew.imageUrl` is the full
  Supabase card illustration, so a 52px centred crop was both a hard one-step downscale of a
  large image (which browsers resample badly, and it read as grain) and a crop of somebody's
  chest.
- **The Special drawer re-weights.** With the rail up, the crew already have a door, so in
  the drawer they shrink to a quiet second way in (thin border, greyed art, smaller type) and
  the repair kit — the one special with no other door — takes the weight. On a phone the
  drawer is still everything and every entry is weighted the same.
- **Signal Flares stay in the column.** The barrage field was `inset: 0` on a stage that over
  the sea is the whole viewport, so on a desktop the flares went up across the entire window,
  outside everything else you were reading. The tap shield stays full-bleed (a stray swat
  anywhere still has to be eaten); only the flares are penned, on the log panel's own width.
- **The stat sheets** are `clamp(380px, 48vw, 620px)` rather than a flat 380, which was a
  phone measurement that turned a sheet of stats into a column of two-word rows.
- **The Navigation bar is on the column too**, and it was the last thing that was not. It ran
  the whole width of the window, which on a desktop is a level bar two thousand pixels long
  over a fight that is 720 wide, and it read as the browser's chrome rather than the game's.
  Over the sea the edges come from `.raid-oversea-bar`
  (`left: max(12px, calc(50% - 360px))`, `right: max(62px, …)`, where 360 is
  `RAID_COL_MAX / 2`); on its own route they come from `maxWidth: RAID_COL_MAX` in
  `RaidGame`. The `max()` is what keeps the old behaviour where the column will not fit:
  under 844px the right inset holds at 62 so the bar never slides under the leave button.

## Sustain copy

Whatever the numbers become, the cap must be STATED on the card that grants it
— boon tiers, the item's generated effect line, and any synergy that moves it.
Players read an unpredictable cap as a broken effect, which is exactly how the
above was found. Keep one sentence shape across all of them so the rule is
learned once.

## Tuning discipline

Changing a raid's battle count means editing the battle sequence, the challenge pin, and
the map node **in lockstep** — three places, one truth. Multi-phase bosses (chapter 3+)
use the N-phase engine; phases are data, not forks of the combat file.

## Connects to

- [story-universe.md](story-universe.md) — the chain IS the story delivery.
- [crew.md](crew.md) — party stats and abilities. [gauntlets.md](gauntlets.md) — reuses
  RaidCombat wholesale. [forge.md](forge.md) + [ship.md](ship.md) — the loadout.

## One fleet, both sides (2026-09)

Enemy hulls below a Man-o-War are the PLAYER'S OWN v3 ships now
(`/ship-hero/{sloop,schooner,brigantine,galleon}_v3.png`), not the per-chapter
`enemychapterN*` paintings. An enemy schooner is the schooner you can buy.

- **Baseline is the Sloop, matching the player.** The ship ladder starts at tier 2 for a
  captain, so it starts there for everybody: the two enemies that were a rowboat and a dinghy
  (Reef Raider and Crow's Nest Marksman, both in Pete's raid) are sloops. Nothing in the game
  is below a sloop any more.
- **The Man-o-War is the exception and keeps its own art.** Three enemies use it (Sal
  Brackwater, The Closer, Don Finleone) and all three stay on `enemychapter4man-o-war.png`.
  There is a second reason beyond taste: every v3 hull below the Man-o-War is authored
  bow-RIGHT and needs `seaFlip` for the player, which is the same orientation the enemy art
  uses under RaidCombat's `scaleX(-1)`. The Man-o-War v3 has no `seaFlip` — it is authored
  bow-left, so as an enemy it would face away from the player.
- **Finn's ship is untouched.** It is not a class hull.
- `ENC_ART_INK` gained four PER-CLASS rows measured with sharp's trim (0.528 / 0.623 / 0.723 /
  0.870). The chapter rows underneath are one number for a whole chapter and always were an
  approximation — chapter one's sloop is really 0.383 against the 0.52 that row claims. The v3
  rows do not inherit that.
- **The plates are SQUARE (640x640) where the old enemy art was wide (600x335).** At the
  fight's fixed container width that makes the sprite's box taller and the visible hull about
  a third bigger. Worth an eye on the framing of a fight; if it wants correcting, it is the
  container in RaidCombat rather than this mapping.
- The rowboat in `components/cutscene.tsx` is deliberately left alone: it is a story beat
  about a little boat that ends up empty, not an encounter.
