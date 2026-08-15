# Gear

Rods, hooks, reels, lines, ships, fish hold, bait. Bought in the marketplace (tackle shop
+ shipyard), each tier a straight upgrade. Gear is the doubloon sink for the fishing loop.

## Where the definitions live

One lib file per gear type, each exporting the full tier ladder with prices and effects:
`web/lib/rods.ts`, `hooks.ts`, `reels.ts`, `lines.ts`, `ships.ts`, `fishHold.ts`,
`bait.ts`. Never quote a tier count or price in docs or copy — read these files.

Shop UIs: `web/app/(app)/marketplace/tackle-shop/` and `marketplace/shipyard/`.

## Rules that differ from what you'd assume

- **Gating is server-enforced**, not just hidden in the UI. `web/lib/gearGating.ts` is the
  single source for which fishing level unlocks which tier; server actions check it. A
  client that shows a locked tier is cosmetic — the purchase would still be refused.
- **Hooks are auto-equipped.** There is no hook inventory or selection; buying the next
  tier simply widens the catch zone. The primer copy reflects this ("Hooks increase your
  catch zone. They're auto equipped...") — keep explanations at that level of plainness.
- **Level unlocks are state-based, not crossing-based.** Anything granted "at level N" is
  granted whenever `level >= N` is observed, not on the level-up event. A player who
  skipped the event (offline, refund, migration) still gets it. Apply this pattern to any
  new unlock.
- The unlock celebration rows live in `web/lib/gearUnlocks.ts` / `web/lib/levelRewards.ts`.
- **The Auto Caster and Auto Catcher are ONE item with a tier upgrade**, not two
  specials (`upgradeOf` on the def in `lib/specialItems.ts`). Both ownership
  columns remain (`has_auto_catcher` is the tier flag), the canonical equip id is
  `auto_caster`, and every surface folds the pair (runtime derives an `autoTier`,
  display goes through `effectiveSpecialDef`). Never render them as two cards —
  the split had a tester running the lesser one while owning both.

## Connects to

- [fishing.md](fishing.md) — every stat here changes dial geometry or catch outcomes.
- [progression.md](progression.md) — the level gates.
- [ship.md](ship.md) — ships here are FISHING ships (crew seats, hold); the combat ship
  is a different system.
