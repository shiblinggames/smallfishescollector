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

## Naming law: berth ≠ bunk

`has_sixth_berth` is a SHIP DEPLOYMENT SLOT purchase (read in several places as
`shipCrewSlots`). The Crew Hall's sleeping slots are **bunks**. The words are kept apart
deliberately — reusing "berth" for hall slots would put two opposite meanings in the
same files. Keep the vocabulary split.

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

Priced at nothing on purpose: a doubloon cost would make respec a wealth check, and a gem
cost would be pay-to-win (re-tuning per boss). Earning it by finishing the campaign is the
price.

## Connects to

- [raids-campaign.md](raids-campaign.md) — class math and mounts apply there.
- [crew.md](crew.md) — berth count = party seats. [forge.md](forge.md) — mounted items.
