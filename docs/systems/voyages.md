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
- **The picker is five cards, not a map with five pins.** It was a painted chart with a
  dot per route: tap a dot, a full-screen sheet, then Set Sail. The dot could say nothing,
  so comparing five routes meant opening five sheets and holding the numbers in your head,
  and the chart was a drawing that matched nothing else in the game. Each card now carries
  what the sheet did — the route's own art, the pay, the XP, the time, the odds, the crew
  risk with its Fortune target, and the drops — and the button on it sends the crew.
  Anything true of ALL routes (the crew's Power/Fortune/Nav, the 1-in-100, a trawl
  conflict) is stated once above them rather than five times over.
- **One frame, not five.** Each route owns a hue in `ROUTE_CONFIGS`, and the card used to
  wear it four times over — edge, outer glow, a wash behind the name, and the Set Sail
  button. Five cards is twenty coloured elements in five different families, none of them
  saying anything the words do not, and all of them competing to be looked at first. The
  hue now survives in ONE place, the risk pill on the band, where it is really the danger
  tier wearing a colour; everything structural is the board's warm neutral and every Set
  Sail is the same tinted gold. **Red stays red** — losing a hand is permanent, and that
  is the one thing on the card worth an alarm colour.
- **Two columns wherever the SHELL is wide enough**, and it is a CONTAINER query
  (`.voyage-routes` in globals.css), not a viewport one: the panel mounts in the hub and
  in the Charterhouse modal, and those are two different widths on one monitor. **The
  Shrouded Reach spans both columns** — it is last in `ROUTE_CONFIGS` and the odd one out
  in kind as well as count, the only route that pays in fishing lures instead of coin.
  The sea's shell is 820 wide for this (not `--modal-w`): it is a wall of postings you
  compare across, not a panel you read.
- **Where it opens from.** The expeditions hub's Voyages card, and mooring at the
  Charterhouse on `/sea` (`sea/VoyageBoard.tsx`, fed by `sea/voyageBoardActions.ts`). Both
  mount the SAME `DailyVoyagePanel` — a second board would drift, and the one thing it must
  never do is disagree about what a voyage pays.
- A pending voyage HARD-LOCKS its party: those crew cannot be reassigned, and the party
  cannot be bulk-cleared, until the voyage resolves. The lock is the `daily_voyages`
  pending row, checked server-side in crew actions.

## Connects to

- [crew.md](crew.md) — party assignment, stats (power = success odds, dodge = speed,
  fortune = doubloons; the stat meanings are voyage-specific).
- [expeditions-hub.md](expeditions-hub.md) — voyage score feeds the shared 0-100 ladder.
