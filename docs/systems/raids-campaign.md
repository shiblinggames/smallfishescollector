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

## Chapter I asks nothing of your level

`requiresNavLevel` is gone from every Chapter I node (`bilge_milestone` was Nav 10, `krust` was
Nav 20). A new captain can play the whole of The Loose Thread on story and clears alone. Later
chapters keep their gates (Ch II from `cartographer_reveal` at 25 onward).


## The Reef Skirmish is a fight, not a raid (2026-09-11)

It ran on `/raids/practice` — the raid TUTORIAL wrapper, with its own enemy table and its own
chrome — so the campaign's first real fight was the one fight in the game that looked like
nothing else in it. It is a `BossRaidConfig` now (`REEF_SKIRMISH`, registered in `ALL_RAIDS`),
fought through the same `RaidGame` as every other node: on the chart through `RaidSheet` when the
player sails up to it, on `/raids/skirmish` for anything that still routes by URL.

`skirmish: true` on the config is the whole of what makes it a skirmish rather than a raid, and it
says three things:

- **No chest.** `RaidGame` skips `rollCrate` and never calls `claimRaidLoot` (neither at the kill
  nor on the Collect fallback), so there is no crate purse either — the 300-600 ⟡ on a raid's win
  screen is the crate's own money. `RaidLootStage` opens straight on the tally with `opened` and
  `counting` already true. A chest for one mob makes the crate mean less everywhere else.
  (`loot: []` alone is not a way to say it: the stage reads `loot[slotFinal]`.)
- **Not a boss.** `sequence: []` makes every round the boss round — that is how the run knows it
  ends after one fight — but `RaidCombat` is handed `isBoss={isBoss && !config.skirmish}`, so the
  Reef Raider is fought as the common enemy it is: no boss nameplate, no boss-only mechanic check,
  no stiffer flee roll, and no "X Sunk" callout over the wreck (`bossDefeatedText` is empty).
- **Its clear is not a raid clear.** `recordSkirmishClear()` writes
  `profiles.has_completed_practice_raid`; it does NOT insert a `raid_completions` row. That table is
  the raid speed board, the raid bounty meters and the "clear any raid in under a minute" badge, and
  a repeatable one-mob fight would walk through all three — plus `recordRaidClear` has a 20-second
  plausibility floor an honest skirmish can duck under. The flag is what `buildClearedSet` has
  always read the `skirmish` node off, so the node clears and the next one opens the way every other
  node does (`router.refresh()` on fight close re-reads it).

The node keeps `raidId: REEF_SKIRMISH.raidId` because that is how `straightIn` knows which config to
compose on the water. It clears through the flag, not through that id, because no row will ever
carry it.

The Reef Raider is borrowed from Pete's own fleet (`CORSAIRS_RECKONING.enemies.brute`) rather than
copied, so thinning his Raiders here and meeting the same hull in his raid later is literally the
same ship. `/raids/practice` is untouched and still reachable; nothing in the campaign routes to it.

## Whose ship that is: the enemy's portrait on the chart

Every hull on the anchorage side is the same silhouette, and the card that says who is on her only
opens once you are already committed. `EncounterMark` draws the enemy's portrait art whole —
cut out, no frame, no crop, floating just above the masthead with its own shadow under it, the same
idiom the gauntlet uses for Davy and the Don. It was briefly a cropped bust in a gold ring, which
read as a UI chip pinned to a ship.

The player's captain keeps the ring, and that asymmetry is deliberate: enemy portraits are cut out
with nothing behind them, crew art is a CARD painted to its own edges, and a card hung over a ship
is a rectangle floating in the sky.

Both disappear the moment the fight starts (`!hullRef` for the enemy, `!fightOn` for the captain):
once the cannons are out the screen belongs to the ships.

## The Reef Skirmish has a guided intro (2026-09-16)

The campaign's first fight shipped with no coaching: the walkthrough lived on the retired
`/raids/practice` page and never moved with the fight. It has one now, and it is the tavern
lobbies' `LobbyGuide` (a stepped `GuideCoach` that flashes `data-coach` handles), not a modal:
four click-through cards from Doby and Kat, each beside the control it names, over the live deck.

- **Cards** (`SKIRMISH_TOUR` in `RaidCombat.tsx`): the action row with Reload named; the aim lock;
  that enemies keep a pattern you can read off their cannonballs (the Reef Raider's is reload, fire,
  reload, fire); and what Special is (crew abilities unlock at level 1 since 2026-09-23 (was 10; ~70% of the old Lv 10 tier), step up at 10/25/40/75/100,
  and the class is fixed by species). Four lines, plain, one asterisked term each.
- **Handles**: `raid-actions` on the row, `raid-fire` / `raid-reload` / `raid-special` on the
  `CircleBtn`s (a `coach` prop), `raid-enemy-charges` on a shrink-to-fit box round the enemy's pips.
- **When**: two frames after the deck paints, only when `RaidGame` passes `skirmishTour`
  (`config.skirmish`), only if `has_seen_skirmish_tour` is false. Marked seen on open, the lobby
  guide's convention. Its own column, because `has_seen_raid_tutorial` was set as a side effect of
  a practice kill and cannot be trusted. `web/supabase/migrate_skirmish_tour.sql`.
- `LobbyGuide` grew `anchored` (card beside the flashed control rather than at the screen's foot)
  and `z` (the fight plays inside the sea's portal). Both off by default so the lobbies are as
  they were.

## The status effects are particles (2026-09-17)

**`components/BattleFx.tsx`: one 2D canvas over the battle stage, and every status aura is
an emitter into it.** Sixteen: seven done to the enemy (burn, freeze, snared, foresee,
marked, stunned, stolen), six done to you (heal, tide, aim, charge, brace, parry), the
persistent burn/freeze on routes with no renderer, and the vengeance ward. The kit it draws
with is `lib/fxCanvas.ts`, lifted from `components/DialFx` (which keeps its own copy on
purpose; keep the two in step).

**Why.** The dial's fire is hundreds of pooled sprites with buoyancy, drag and a heat ramp,
blended ADDITIVELY. The auras were DOM: a gradient wash and six `<span>` motes tweened A to
B with a `box-shadow` glow. A box-shadow does not add, a tween is not physics, one colour
cannot read as heat, and the DOM version had to avoid blend modes because a blended layer
starved the aim needle's RAF. One canvas lifts every one of those.

**What it does NOT replace.** Over the sea and in the gauntlet, `sea/seaAbilityFx.ts` (Pixi)
paints the PERSISTENT conditions on the hull the chart is painting, and the ability casts on
the water. Those stay. The `!overSea` guard on `ShipStatusAura` is what keeps the two from
double-drawing a burn.

**Rules it keeps.** It halts during `subPhase === 'aiming'` and holds the last frame -- the
needle is on the compositor and main-thread work stays off it. It is canvas 2D, never a
second WebGL context (see DialFx for what that did to the chart). Each aura component still
mounts inside the hull's box at `inset: 0` and hands the layer that element; the loop reads
its rect every frame, so recoil and the sea re-placing the hull come for free, and keeps the
last rect once the element is gone. `--ink` is read off the same element so a fire is sized
to the ship, not the painting. The layer goes fully idle -- no RAF -- when nothing is alive.

**Adding a status.** Add the kind to `FxKind` and `COLOR`, a `DUR`, a `case` in `drive`.
The vocabulary is small on purpose: an elliptical wash, rings that expand or converge,
pooled particles in eight modes (rise, fall, inward, drift, stream, orbit, smoke, spark), and
stroked marks (reticle, brackets, slash, arc). Build new ones from those.

**The legendaries have their own signatures (2026-09-18).** Five of the seven legendary boons
fired the same cue as a common boon with the same effect. Each has a picture of its own now,
on the same layer, with NO title card and NO spark burst by Kong's call ("it should already
tell you it occurred in the action log"): Kraken's Grip draws a quiet violet ring tightening
per coil and, on the close, four tentacle arcs rising from under the hull that clench with a
crit impact and ink; Leviathan's Hunger on a DEEP drink only (a crit, or a sixth of the hull
in one swallow) streams blood in from the enemy's side and answers green; Man-o-War's Wrath
throws a gold double shockwave over the Mega's blast; the Don's Favor lights your hull at the
opening in the colour of what was granted; Powder Hoard fires the charge flare with "+N
loaded". Executioner and Stormward already had theirs. The chase-skin strike FX were NOT
borrowed for these: those stay chase-only on purpose.

**The chase skins' set pieces and the summon are on it too (2026-09-18).** Kong: "port all of
them and juice them up." `components/ChaseStrikeFx.tsx` (six framer-motion set pieces, 48
elements) is gone; Tempest, Hunter's Bane, the Idol's mark, Kraken Hunter's scry, Galaxy and
Fossil are `enemy:tempest / enemy:leviathan / enemy:requiem / enemy:oracle / player:galaxy /
player:fossil` in BattleFx, mounted by `ChaseStrikeMount` in the same hull boxes on the same
timings (Tempest's length follows the barrage through `live.dur`). Juice that DOM could not
do: real rain and a massing cloud under the storm, bolts with a white filament that throw
sparks off the hull, a two-hundred-star spiral galaxy turning behind the hull, a pupil that
LOOKS during the scry, stone dust at the ward's lock. The summon splash's light show (rays,
rings, flash, ripples, sparks, and the per-skin signature that was `ChaseSkinFx variant=
"summon"`) is one emitter, `summon:arrive`, into a SECOND canvas on its own bus (`'summon'`,
inside the portal, behind the art); the crew `<img>` carries no filter any more. The
raid-item pill's two rings are `pill:cast`. `bangChase` (the Pixi half on the water) is
untouched. `ChaseSkinFx` still serves the crew cards and skin previews.

**Where an effect sits on a hull, and how big it is (2026-09-18).** Kong, on the persistent
burn and freeze: "the flames and the ice crystals look bad. They look really small and are
always sitting way under the actual enemy ship." Two causes, both about measuring the
PICTURE instead of the SHIP.

`--ink` (2026) already told an effect how much of the painting's WIDTH is hull, because fire
sized to the frame burned in open water either side of her. Nothing ever did the same for
the other axis, and the other axis was worse: the flames seated at 0.9 of the box. For the
enemy the anchor IS her waterline and the art hangs entirely above it, so 0.9 is roughly
right; for YOUR ship the anchor is the sprite's CENTRE, so the box runs half a painting below
the hull and 0.9 is open water. `place()` now publishes `--wl`, the fraction of the box the
waterline sits at (0.97 enemy, 0.80 player, 0.88 default off the sea), and BattleFx seats
`wy` on it.

The size was a separate bug: the ice facets were clamped by `Math.min(1, hh / 44)`, so a
crystal could never exceed about 26px however large the ship was drawn, and the flame tongues
scaled off `hh` (the picture's half-height, transparent sky included). Both now scale from
`hw`, which is the box narrowed by `--ink` and therefore a real measurement of her. The fire
also went from three tongues to five, gained a dark base and a lean that sways, and the ice
from eight facets to ten spread across her middle. The RISING PARTICLES were left alone;
Kong said those already looked good.

**The Mist Veil stopped being one wedge (2026-09-18).** "The mist veil effect looks cheap."
It was a single grey gradient band translating left and right on a 1.6s loop, which is what
it looked like. It is three banks now at three widths, three speeds and two directions over a
standing haze that breathes, so the bar is never covered the same way twice. The constraint
it still honours: no blur, no filter and no blend mode anywhere on the aim bar, because that
surface sits beside the needle and every layer on it must stay on the compositor. Soft-edged
gradients do a blur's work. The density the mechanic reads is unchanged.

## The first shot paid for every later one (2026-09-18)

Kong, on a phone: "the very first time you lock in your shot there's still lag." Every shot
after it is clean, which is the shape of a ONE-TIME cost being paid on the worst frame in the
game: the one a press is judged on.

Three first-use costs, none of them per-shot work:

1. **The hulls have no compositor layer until they first move.** Both are large paintings
   inside `motion.div`s driven by animation controls, and the first `.start()` is where the
   browser promotes the element and uploads that texture. That first start is the first hit,
   i.e. the first lock.
2. **Framer's machinery for each control** initialises on its first start.
3. **The impact flash sits at `display: none` between flashes**, so the first one is a fresh
   full-viewport layer as well as a paint.

`warmFightFx()` does all of it at fight open, while the player is reading the enemy's card
and nothing is being judged. Every warm move is zero-amplitude and the flash is warmed at
zero opacity, so none of it is visible; only the TIMING changes. Deliberately not a standing
`will-change` on the hulls: that pins a layer for the whole fight, and there is a standing
warning in memory about what permanent compositor hints do to these scaled paintings. A
zero-length animation promotes the layer and lets the browser drop it again.

BattleFx had the same shape of problem: `D()` and `R()` baked their sprites on first use, and
first use is the first status effect of a fight. The whole `COLOR` table is baked in idle
time at mount now; the lazy path stays for colours a caller passes that are not in it (a
chase skin's accent, a boon's own colour).

**If a first-lock hitch survives this, the next suspects are the LogBox's first mount (it
swaps inline with the aim bar) and the first decode of the hit-state art.** Measure with the
DELAY-vs-WORST method before changing anything else; that is what settled the blend-mode
isolation bug, which cost 104ms a crit and was nowhere near where it looked.

## The harbour gate stops being a toll you can fail into (2026-09-18)

Kong: "A missed shot actually sends you all the way back to the anchorage. Similar to how you
get sent back if you sink in a battle... This matches it better as an open world game."

**What it did.** A miss charged `failCost` (20,000) AND marked the node cleared, so falling
short still got you through, for money. That made it the one obstacle in the game you could
buy your way past by failing at it. Worse, both the client and the server refused to let you
fire at all unless you were holding the full repair bill, so the free route was open only to
the captains who least needed it.

**What it does.** A miss clears nothing and costs nothing. The gate holds, and `onRepelled`
warps the captain to the Gunwharf berth, which is exactly what `SeaMap`'s `sunkRef` already
does when a fight sinks you, and for the reason written there: "a captain who has just lost
should be asked to try again, not sent away to earn the right to." The whole penalty is the
water between you and the gate. Anyone may fire; `canShoot` and `hardLocked` are gone, and
`RaidDpsCheck.failCost` is deprecated and unread.

**`onActed` now fires only on a pass.** It means "cleared server-side", and a miss is not,
so firing it regardless was lighting up a stop the captain had not made.

**And it looks like a gate.** It was a beat marker on a rock called The Fork, with nothing
about it reading as a barrier. Two posts (`cof-gatepost-n` / `-s`) now stand square across
the lane just past the fork, 1,400px apart centre to centre with 1,060px of clear water
between their faces, so the road threads between them. Placed off the road's LOCAL TANGENT
at that point, not by eye: same probe method as the Sounding fog bank, and the trader check
still clears every shore.

**And the chain is strung (2026-09-18).** `app/(app)/sea/seaChains.ts`, declared as `CHAINS`
in `raidWaters`. Twenty-six iron links and three tarred floats hung between the two posts,
sagging into the water and squashed by `GROUND` like everything else that floats. It reads
the cleared-node map the renderer is handed (`clearedNodes`, built off the chart's own
`liveStatus`, so an optimistic clear drops it on the same frame the stop lights up) and when
its node is done it goes slack, sinks and fades: exactly what the next node's bridge already
said happened. The ease is deliberate; a thing that drops takes a moment. `?hide=chains`
kills it. Superseded note: The node after this one says "the lens flares green and the
boom-chain drops into the water", so a chain across the gap is already canon and is the piece
that would make the posts unmistakably a gate rather than two rocks.

## The Coffers approach is two barriers, not one (2026-09-18)

The chain was first hung on the GATE, and the texts say otherwise. Node 28 is "a barred gate
stands across the channel" that a cannon shot breaks or a bribe skips. Node 29 is "the way
past the harbor WALL", where lighting the signal-lens drops a boom-chain. Two obstacles, in
that order, and hanging the chain on the first meant the second node's bridge and reveal both
described something the player never saw.

`SPANS` in `raidWaters` (was `CHAINS`, aliased for safety) now carries a `kind`, and the
kind changes both the drawing and the leaving:

- **`gate`** is rigid. Eleven banded bars across the lane, made fast to `cof-gatepost-n/-s`.
  A shot BREAKS it, so on clear the bars scatter outward from the middle and go: the hole
  opens where the ball went in and the ends are the last to let go. It does not sink.
- **`chain`** is slack. Links and floats made fast to `cof-wall-n/-s`, a stop further on,
  sagging into the water. A signal DROPS it, so on clear it goes slack and slides under.

Both post pairs are placed off the road's LOCAL TANGENT at their stop, probed rather than
eyeballed, and the trader check still clears every shore.

**Also fixed, pre-existing:** node 28's bridge read "the gate's behind you, and the market's
war-fleet is already turning to meet you", which skips the harbour wall and its boom
entirely, and those are the very next stop.

## The finale on the water (One Last Ride, 2026-09-24)

Finn's fight (`THE_SUNKEN_HAND`, `aimStyle: 'dial'`) had not followed either side's facelift.
Kong: get it visually on par. What changed, and what not to regress:
- **No photo over the sea.** His six `finn_bg*.jpg` phase backdrops are side-on paintings from
  the page era; over the chart they were opaque and hid the water AND both Pixi hulls. Over the
  sea `RaidGame` paints nothing now, phase included. Instead `RaidCombat.onEnemyPhase` ->
  `RaidSheet` -> SeaMap `fightPhaseRef`, and the frame loop eases the water (~1.5s) into
  `raidWaters PHASE_MOOD.the_sunken_hand[phase-1]` (bone fog / iron / whitecapped wake / dead
  flat / cold swell / red maw), and back to the bay's mood when the fight closes. Any boss can
  get the same by adding a PHASE_MOOD entry. The /raids/sunken-hand route still uses the photos.
- **No scrim.** The dial overlay laid a ~0.88 black lid over the top 68% of the screen every
  shot. Now only a soft radial shade just past the rim (never reaching the action row).
- **The fishing dial's dress.** `DialFx` (2D canvas, safe over the chart) behind the dial:
  streak fire and crit spark ring; the static Ancient aura ring on DialSVG.
- **Gear on the water.** `RaidSheet` never passed `dialAim`, so from the chart the rod/hook/reel
  did nothing to the dial. Fixed.
- **The dial runs on the compositor** like the bar and the fishing needle (`compositor =
  !squallActive`): the needle layer is a WAAPI rotate 0 -> 360 -> 0deg, and so is the BAND, which
  lives in its OWN div layer (`DialSVG bandRef`; fishing keeps the in-SVG `zonesGroupRef`). Same
  triangle wave and clock as the bar, so `needleAt`/`zoneAt` and the lock are unchanged.
  Two things that went wrong first, do not regress: (1) the band as an SVG `<g>` inside the dial
  can never be composited, so moving it repainted the whole instrument every frame (Finn's aim
  "laggy"); (2) a CSS pivot on that group plus the lock's `rotate(deg, CX, CY)` ATTRIBUTE applied
  the centre twice once the sweep was cancelled, and the band flew off the dial on lock.
- **The lock lands:** `DialAimInline` pops the whole dial on every lock (1.04) and harder with a
  settle on a crit (1.09 -> 0.97), transform-only; DialFx runs in `sparks` mode (crit spark ring
  from the first crit, idle frames draw nothing). The breathing Ancient canvas aura is OFF here
  (it was the Ancient Deep's lag); the static SVG aura ring stays.
- **Aim parity with the bar (2026-09-24).** `AimBarFx shape="dial"` lays the bar's effects round
  the ring (target bloom along the band, hot crit core, the approach flare, the needle's light,
  and the lock burst in the result colour, which `lockShot` now fires on the dial too). Bands use
  the bar's translucent reading (`DIAL_ZONE_OPACITY` .72/.42/.26) with the gold hairline
  (FishingDial, marker needle only), and the bar's "Lock Your Shot / Gold = Crit" header sits
  over the dial. The dial's private streak text is gone.

## Boosts live on the portrait ring (2026-09-24)

Kong: Cannonade / Perfect Streak, and Davy's cannon heat, were three pills in three places and
three styles. All boosts are now `boostChips` at the front of `playerChips`, drawn by
`StatusRing` as marks like every ward and burn: `streak` (bolt, badge = stacks or MAX), `pierce`
(when the streak goes through plate), `heat` (thermometer, badge = ramp %). `BespokeChip.badge`
is the corner text and re-pops the mark when it changes. Add any new boost here, never as a
free-floating pill.


## The Captain's Ledger (player stats card, 2026-09-24)

Kong: it looked old beside the enemy's card and did not show current statuses. `PlayerStatsPopup`
now opens like `EnemyStatsPopup`: a full-bleed portrait panel (your hull on a blue pool, your
CharacterAvatar + name on the scrim), an HP card first in the grid (with the shield pool), and
**Right Now** (ConditionsSection, renamed from "Conditions" on both cards) leading the Stats tab.
Its conditions list is every mark on your portrait ring, not just the status pipeline: streak,
pierce, cannon heat, shield pool, Vengeance ward, Sharpshot, statuses, burn, freeze, aim
affliction, brace. A new mark on the ring needs a line here too.
The Gear tab is ART FIRST (Kong, same day): equipped items are tiles (large painting on a rarity
pool, rarity on the art, name + effects under), two-plus across; the crate odds are art tiles with
the odds under. Ultimates have no art yet, so their card stays text. The crate odds then MOVED to
the boss's card (`CrateOddsTiles`, "In the Crate", boss only): the drops belong to the fight, and
the player's Fortune card already shows the multiplier.

## Crew rail and hit flash (2026-09-24)

- `CrewRail` (desktop) tiles are portrait CARDS (70 x 92, art cover top-centre) with the crew
  member's NAME (`SpecialItem.name`) on the art over a dark fade, a steady class-colour rim when
  ready, no breathing glow; a used ability is grey with a "Used" tag, while not-your-turn only
  dims. The ability and its effect stay in the tooltip.
- Over the water the DOM `ImpactBurst` / `CannonShotBurst` no longer render: the sea's own gun FX
  already draws the strike, and the two stacked read as a hard white flash (Kong: too strong).
  The sea's strike flash is smaller and fainter (40px @ .34, crit 70 @ .55), and the whole-stage
  impact flash is halved (.32 / .16).
- Second pass on the flash (Kong: still too bright): the MUZZLE flash was 150px growing 320/s at
  0.95 additive on every shot; it is 84 / 130 / 0.5. A crit's fireball 96 @ .8 and star 110 @ .6.
- A chase skin's summon no longer opens on the rune wheel (18 turning rays + two counter-rotating
  dashed rings): its gold flare, foot ripples and signature carry it. Ordinary summons keep it.
