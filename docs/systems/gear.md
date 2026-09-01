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


## Selling rods back

`sellRod` has existed for a long time and its only door was the fishing page's gear sheet —
so the **tackle shop**, a wall of rods that takes your money, had no way to give any of it
back. It is on the rod cards now, beside Equip: one tap to arm, a second to confirm, because
it deletes a rod.

`ROD_SELL_RATE` (0.65) moved from a private const inside the shop's `'use server'` actions
file into `lib/rods.ts`. The UI needs it to print the refund on the button, and **a
`'use server'` file silently drops every non-async export** — exporting it from there would
have compiled and then been `undefined` at runtime.

Free starters and earned rods are excluded from the button as well as blocked server-side:
they refund nothing, so a button that deletes one for zero is a trap, not an option. 19 of
the 21 rods are sellable.

Selling the EQUIPPED rod is allowed; the server auto-equips the free Bamboo and returns the
tier it landed on, which the client mirrors rather than assumes.

## The rod rack is removed (2026-09-01)

**You carry every rod you own and swap freely from the loadout sheet at sea.**

The rack was a four-rung ladder (40k / 140k / 450k ⟡) that bought SLOTS, and only rods in
a slot could be swapped on the water. Its argument is still in the git history and it was
a real one — "there is no decision at all if the answer is always everything" — but it
taxed a convenience rather than gating a power: every rod in a berth was already bought
and already owned, so the rack sold access to your own inventory, and the only outcome it
could produce was being out in the Ancient Deep holding the wrong rod.

**Nobody bought it.** Two profiles in the whole game ever raised a rung, one of them the
developer's. 79 of 81 captains never touched it.

Gone with it: `RACK_SLOTS`, `RACK_COSTS`, `MAX_RACK_TIER`, `rackSlots`, `nextRackCost`, the
`buyRackBerth` and `setRodsAboard` server actions, and the whole Rod rack band and berth
picker in `ShipyardClient`. `rodsAboard` survives but now takes the inventory instead of a
tier. The `rod_rack_tier` and `rods_aboard` columns are LEFT IN PLACE and simply unread —
they carry history and one player's 630,000 ⟡ of purchases.

`ownedRodTiers` in `lib/rods.ts` is the one rule for what a captain owns: `rod_inventory`
holds only PURCHASED rods, so free tiers have to be added back or a new captain owns
nothing. That rule used to live inside `setRodsAboard` and nowhere else.

**The Shipyard is now the boat**: hull, rudder, acceleration, hold, and which boat you sail.

**The loadout sheet** (`sea/LoadoutBody`) draws `components/PreviewStage` — the same stage
the Shipyard uses, moved out of the shipyard folder when the third consumer appeared. The
rod grid shows sprites rather than a column of names, because the sprite is how a rod is
actually recognised.
