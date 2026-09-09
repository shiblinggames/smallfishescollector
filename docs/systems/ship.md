# The Combat Ship

The player's warship: class, augments, item mounts, repair. Distinct from the FISHING
ships in the tackle economy — same word, different system.

## Files

- Classes and combat math: `web/lib/shipClasses.ts` (chapter-end "Captain's Choice"
  picks the class; the choice feeds directly into raid damage/defense math).
- Augments/berth/skins: `web/lib/shipAugments.ts`, `shipBerth.ts`, `shipSkins.ts`
- Ultimate weapon: `web/lib/ultimateBuild.ts`; Armory expansion + repair kits:
  `web/lib/repairKits.ts`, `web/app/(app)/expeditions/ArmoryExpansionPanel.tsx`
- Hero display: `web/app/(app)/expeditions/ShipHero.tsx`
- The sea's doors into it: `web/app/(app)/sea/ShipSheet.tsx`

## Three doors on the sea, one shell

`sea/ShipSheet.tsx` is the panel every ship screen opens in out on the water. One
component because all three landings are ONE server read (`getShipHeroProps`) and one
card; `focus` says which door asked:

- **`ship`** — the Gunwharf's "Manage Her". Her stats, the one upgrade, and three painted
  plates (Refits / Armament / Look) whose bodies are `ShipHero`'s tiles.
- **`forge`** — the Forge ISLAND, and nothing about the hull. You sailed to a building.
- **`items`** — the **Battle Loadout** disc in the expedition side's HUD row, beside the
  crew. It was `/expeditions/items` (now a redirect to `/sea?open=loadout`) plus a drawer
  behind "Manage Ship" on the hub. What you mount is a between-fights decision and between
  fights you are on the water. Not on the fishing side: a raid relic does not touch a rod.

**Everything behind those doors is still `ShipHero`, mounted `bare`** — the tiles, the
slot grid, the picker, the item sheets, the effects breakdown, six purchase flows. `bare`
drops what belongs to a full-screen route and would be drawn twice inside a card: the
painted `sectionBg` plate, the navy ground under it, `ShipHero`'s own focus header, and
(since the loadout landed) the `.page-col` gutter and the 6rem phone-nav-bar tail. Do not
rewrite these bodies to change how a card looks — that trades a day of risk for a border
radius, and it is why the conversions have all been shells.

## Naming law: berth ≠ bunk

`has_sixth_berth` is a SHIP DEPLOYMENT SLOT purchase (read in several places as
`shipCrewSlots`). The Crew Hall's sleeping slots are **bunks**. The words are kept apart
deliberately — reusing "berth" for hall slots would put two opposite meanings in the
same files. Keep the vocabulary split.

## The hull ladder starts at the Sloop

Seven hulls became five (2026-08). The Rowboat and the Dinghy were removed and the
**Sloop is free**, the hull every captain begins with. The live numbers made the case:
55 of 81 captains had never bought a ship and 3 more had stopped at the Dinghy, so the
bottom of the ladder was runway nobody walked. It bought durability and nothing that
changed how a fight is fought.

| Tier | Hull | Cost | Crew | Mounts | HP / speed / min dmg |
|---|---|---|---|---|---|
| 2 | Sloop | free | 1 | 1 | 35 / 4 / 4 |
| 3 | Schooner | 5,000 ⟡ | 2 | 2 | 45 / 5 / 6 |
| 4 | Brigantine | 22,000 ⟡ | 3 | 3 | 60 / 6 / 9 |
| 5 | Galleon | 80,000 ⟡ | 4 | 4 | 85 / 8 / 14 |
| 6 | Man-o-War | 200,000 ⟡ | 5 | 4 | 125 / 11 / 20 |

Every rung now moves the crew count, which the old curve did not: four hulls used to
carry a captain from 1 seat to 2.

**The tier numbers did not shift, and must not.** `profiles.ship_tier` is read as a
THRESHOLD in a dozen places that have nothing to do with this ladder — `MANOWAR_TIER`,
the `ship_of_the_line` badge, ship skins' `requiresShipTier`/`imageByTier`, voyage
routes' `minShipTier`, `RAID_ITEM_SLOTS`, `RAID_REPAIR_COST`. Renumbering means
subtracting two from every one of them and a missed one fails silently, in the direction
of giving things away. So the Sloop keeps tier 2 and the ladder simply has no bottom two
rungs. A DB CHECK holds `ship_tier` between 2 and 6.

**Index is no longer tier.** `SHIPS[n]` is wrong now; use `getShip(tier)`,
`nextShip(tier)` and `shipTierByName(name)`. Anything comparing against `SHIPS.length`
is also wrong — length is 5, the top tier is 6. That exact bug would have told a
Brigantine captain they were maxed out and refused to sell them the last two hulls.
`EXPEDITION_SHIP_STATS` keeps aliases at 0 and 1 pointing to the Sloop so a legacy tier
still answers.

**Voyage routes were left open.** Four of the five gate at `minShipTier: 2`, which every
captain now meets. Deliberate: those gates are a floor for a future rung, not a lock.

## Design shape

- Big buyables are GATED, not just priced: the Ultimate build (Man-o-War Mega) sits
  behind multiple prerequisites plus a long build timer; the Armory expansion is a
  chapter-gated purchase adding a raid-item mount. Prices/timers live in the lib files.
- Ship PvP was REMOVED (2026-08) — bounties absorbed its competitive role. Don't build
  ship-vs-ship features back in; see [bounties.md](bounties.md).

## The Refit (one lifetime re-choice)

Class picks are permanent IDENTITY by design. The single concession is the **Refit**:
earned by clearing `the_throne` (Chapter IV's boss), spendable once ever, tracked by
`profiles.ship_refit_used`. Offered at the foot of the Captain's Class modal on the
ship screen (`ShipRefitPanel.tsx`, action `refitShipClasses`).

Two rules it exists to protect:

- **All chapters at once, in play order.** `offeredShipClasses` only offers a Mark II on
  a line you already own, so resetting one chapter could strand a Mark II with no Mark I.
  The panel re-walks every chapter and `validateClassPicks` re-checks the whole ladder
  server-side.
- **Never touch `raid_node_progress`.** The Chapter II class node IS `GAUNTLET_UNLOCK_NODE`
  and later chapters hang off these nodes via `requiresNode`. Un-clearing them to make a
  captain "re-earn" the picks would re-lock the Gauntlet and half the campaign. The refit
  writes `ship_classes` and nothing else.

**Price: the first is free, every one after costs `SHIP_REFIT_COST` (1,000,000 ⟡).**
Count lives on `profiles.ship_refits_used`; `shipRefitCost(used)` is the only place the
price is decided and the server reads it off the count rather than trusting the client.

One-and-done was the original design and it left a hole: `mark_of_mastery` wants a Mark
III, a Mark III wants all three picks in one line, and a captain who spread their picks on
the original AND on the refit could never reach one again. That is a permanently capped
Achievement Point total, not just a missed badge, and those points gate cosmetics. So the
door stays open and the price shuts it to anyone browsing.

Flat, not escalating: a refit re-walks all three chapters at once, so swapping between
fights was never a strategy anyone could run even for free, and escalation would only tax
whoever experiments most. **Doubloons, never gems** — the renown respec takes gems
(`RENOWN_RESPEC_GEM_COST`) and that is precedent, but a paid re-tune of a COMBAT build is
pay-to-win by our own pillar.

## Connects to

- [raids-campaign.md](raids-campaign.md) — class math and mounts apply there.
- [crew.md](crew.md) — berth count = party seats. [forge.md](forge.md) — mounted items.

## Ship skins are a Man-o-War thing

One rule, and it holds everywhere: **a skin only shows on the Man-o-War** (tier 6). Twelve of
the thirteen carry bespoke art at that tier and the thirteenth is a tint written for that
silhouette, so letting them ride a rowboat meant either drawing every skin seven times or
showing a captain a sprite never meant for their hull. The drops that pay for one come off
the deep end of the campaign, where a Man-o-War is what you are sailing anyway: it is a
trophy for the last hull, so it hangs on the last hull.

`shipSkinAt` / `shipSkinImage` / `shipSkinFilter` in `lib/shipSkins.ts` are THE resolvers and
every render site goes through them — the raid stats, the hub, the ship hero, both profiles,
the gauntlet and the practice fight. A skin resolved anywhere else is a place the rule does
not hold, which is how a cosmetic ends up half applied: right in a fight, wrong on a profile.
`canEquipShipSkin` folds the hull gate in, so a per-skin `requiresShipTier` can only ever be
stricter and never binds today.

**The picker says it out loud** rather than letting a captain discover it by equipping
something and seeing nothing change: a line under the title that changes wording when you are
not in a Man-o-War, and *"Man-o-War only"* on every tile that cannot be worn. Tiles always
show the Man-o-War paint, because that is what you would be wearing.

**The chart wears it too.** `shipSkinSeaImage` is the same rule with a different fallback —
the sea's hull is `seaImageUrl` rather than `image`. It works because the chart's hull art
(`/ship-hero/*`) is the same three-quarter, bow-left view the skins are painted in, so a
skin reads on the water exactly as it does in a fight. All four sea sites take it: the canvas
hull, the DOM `Warship`, `ShipAtBerth` in the Gunwharf, and the Gunwharf's own take-her-out
door, which is a picture of the ship you are about to sail.

**And it has to be scaled, because the plates are padded differently.** The chart sizes a
hull by the width of its PLATE, which is fine while every plate crops its ship the same way.
Measured (opaque-pixel bounding box against plate width):

| plate | ink / plate |
|---|---|
| `/ship-hero/man-o-war_v3.png` (the chart's own hull) | **0.969** |
| every skin plate | **0.651** |

So drawn to the same width a skin put its ship on the water at 67% of the size — visibly
smaller, and nothing to do with the ships. `SKIN_SEA_SCALE` is the reciprocal (1.488) and
`shipSkinSeaScale` returns it only when a skin is actually in effect. All three chart paths
apply it: `makeShip` takes a `scale` (and it is in the captain cache key), and the DOM
`Warship` and `ShipAtBerth` multiply their widths.

**Only the chart.** The FIGHT sizes off `/models/*`, which measures 0.652 — the same crop the
skins use — so combat was always consistent and must not be touched. The `/ship-hero` set is
the odd one out. Every skin plate in the table today measures 0.650–0.652, which is one
export pipeline; if a future skin is cropped differently, measure it rather than nudging the
constant.
