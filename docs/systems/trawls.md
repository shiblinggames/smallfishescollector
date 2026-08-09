# Trawls

Crew-powered passive fishing. Send benched crew to a zone; they fish it for an hour and
return doubloons + fishing XP. The bridge between the crew system and the fishing loop.

## Files

- Actions + state: `web/app/(app)/fishing/trawls/actions.ts`
- Constants: kept in a plain module beside the actions (NOT in the `'use server'` file —
  see the `'use server'` export-stripping trap in [platform.md](platform.md)).
- The hub indicator: `web/app/(app)/fishing/TrawlIndicator.tsx`.

## Rules that differ from what you'd assume

- **Starting a trawl BENCHES the crew** — it clears both party slots outright rather than
  refusing a seated crew. This is the opposite of the bunkhouse, which refuses. The three
  states (seated / trawling / bunked) are mutually exclusive by construction; see
  [crew.md](crew.md) for the full exclusivity argument before changing any of the three.
- **`collectTrawl` is read-check-then-delete**, protected only by a client `busy` flag —
  it can double-grant under truly concurrent taps. Known, accepted for the stakes
  involved. If you ever raise trawl payouts substantially, make collection conditional
  (`delete ... eq(since)` style) like the bunk claim already is.
- Trawl rewards are fishing-flavored only (doubloons, fishing XP). They deliberately do
  not touch raid loot pools.

## Connects to

- [crew.md](crew.md) — supplies the workers; exclusivity rules.
- [fishing.md](fishing.md) — zone list and XP sink are shared.
