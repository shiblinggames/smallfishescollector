# Expeditions Hub & Scoring

The /expeditions page: the second core loop's front door. Voyages and raids share one
Expedition Score ladder (0-100) — a single number that both activities feed, so neither
playstyle is second-class.

## Files

- Ladder + level: `web/lib/expeditions.ts`, `web/lib/expeditionLevel.ts`
- Hub composition: `web/app/(app)/expeditions/page.tsx`, `hubData.ts`, `HubCards.tsx`,
  `ShipHeroSection.tsx`

## Design shape

- The hub is a launcher, not a game surface: ship hero up top, then cards for voyage,
  raids, bounties, forge, armory, ultimate. Panels stack; each system owns its panel
  component in this directory but its RULES live in its own doc.
- Score thresholds and level curves live in the two lib files. The shared ladder is the
  invariant — if a new activity wants to grant expedition score, it must map onto the
  same 0-100 scale rather than getting its own meter.

## Connects to

- [voyages.md](voyages.md), [raids-campaign.md](raids-campaign.md) — the two feeders.
- [progression.md](progression.md) — Navigation level gates most of this side.
