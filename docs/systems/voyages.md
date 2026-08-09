# Voyages

Daily passive exploration: assign a voyage party, pick a route, collect the result later.
Half of the Expeditions score (with raids). Deliberately simple — the depth lives in crew
composition, not in the voyage itself.

## Files

- Core resolution: `web/lib/voyage.ts`, `web/lib/voyageRoll.ts`
- Events and routes: `web/lib/voyageEvents.ts`, `web/lib/voyageRoutes.ts`
- UI + actions: `web/app/(app)/expeditions/DailyVoyagePanel.tsx`, `voyageActions.ts`

## Design rules (each one was litigated — don't relax casually)

- **ONE event and ONE loot roll per voyage.** A voyage is a single beat, not an episode.
  Adding more rolls inflates variance and reading time for no decision content.
- **Voyage drops are fishing-aid items only.** Never raid-pool items — raids are the only
  source of raid loot, and crossing the streams devalues both. (`voyageRoutes` defines
  the drop tables; keep them pointed at fishing consumables.)
- **Crew loss risk is a single flat roll per voyage**, not per-crew. Fortune reduces it,
  reaching zero at the Nav gate. The flat roll keeps big rosters from feeling like a
  casualty lottery.
- Per-route lengths vary; the "Massive Booty" jackpot outcome is rare by design (order
  of 1-in-100 — the actual odds live in the route/roll code).
- A pending voyage HARD-LOCKS its party: those crew cannot be reassigned, and the party
  cannot be bulk-cleared, until the voyage resolves. The lock is the `daily_voyages`
  pending row, checked server-side in crew actions.

## Connects to

- [crew.md](crew.md) — party assignment, stats (power = success odds, dodge = speed,
  fortune = doubloons; the stat meanings are voyage-specific).
- [expeditions-hub.md](expeditions-hub.md) — voyage score feeds the shared 0-100 ladder.
