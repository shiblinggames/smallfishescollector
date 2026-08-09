# Forge & Abyssal Accelerator

Raid-item crafting: fuse items you have into items you want, and cook epics into
legendaries on a timer. The sink for surplus raid loot.

## Files

- Recipes + bench UI: `web/app/(app)/expeditions/forge/`, `ForgeBoard.tsx`
- Accelerator: `web/lib/abyssalAccelerator.ts`
- Item definitions: `web/lib/raidItems.ts`; grants: the ITEM_GRANTS map in loot code.

## Rules

- **`FORGE_RECIPES` is DESTRUCTIVE** — inputs are consumed. Any new recipe must follow
  consume-before-grant with the removal guarding the grant (a failed consume must never
  still grant; see the swap pattern in [platform.md](platform.md)).
- **Adding a raid item = one recipe + its definitions + an `ITEM_GRANTS` entry.** A
  missing grants entry is a SILENT skip — the item drops in loot UI and never lands in
  inventory. This shipped once; check all three places every time.
- The Accelerator is the slow lane: epic → legendary on a long timer with a gem-priced
  slot. It is deliberately not instant — the wait is the price distinction between it
  and forging.
- Forge unlocks with the Locker (gauntlet progression), not with raids — it's endgame
  surplus management, not early crafting.

## Connects to

- [gauntlets.md](gauntlets.md) / [raids-campaign.md](raids-campaign.md) — input supply.
- [ship.md](ship.md) — forged items mount on the ship loadout.
