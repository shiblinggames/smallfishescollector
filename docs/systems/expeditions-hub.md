# Expeditions: the score ladder, and the page that used to hold it

Voyages and raids share one Expedition Score ladder (0-100) — a single number both
activities feed, so neither playstyle is second-class.

## THE /expeditions PAGE IS GONE (2026-09-09)

It is a **redirect to `/sea`**, and so are `/expeditions/ship`, `/forge` and `/items`.
There is no expeditions hub any more; there is the water.

Everything the page held is a place you sail to:

| was a tile on the hub | is now |
|---|---|
| the campaign node map | water you sail, one stop at a time |
| voyages | the Charterhouse |
| bounties | the Posting House |
| the gauntlets | two maelstroms you descend into |
| your ship, and its three rooms | the Gunwharf |
| the battle loadout | a disc in the expedition side's HUD |
| the forge | the Forge island |
| your crew | the crew disc, and the Crew Hall ashore |
| farming a boss you have beaten | the Wargate |

**Why**, and it is the rule the anchorage was built on: expeditions' management should be
somewhere you GO, not a tab you open. While the page existed every one of those places had
two doors — one you sailed to and one you clicked — and a page of tiles is the opposite of
a place by construction.

**The Expeditions tab is off the Nav**, mobile and desktop. Its voyage dot moved to the
Seas tab, because a finished voyage is claimed at the Charterhouse.

## The directory is still there, and that is deliberate

`web/app/(app)/expeditions/` is a **component library with no page on it**. The sea imports
twenty-odd modules from it — `ShipHero`, `BossFightModal`, the five puzzle boards,
`DailyVoyagePanel`, `SpoilsBoard`, `StoryScene`, `raidMapActions`, `shipHeroData` — because
the water was built to REACH the hub's own components rather than to reimplement them. That
is why the two surfaces never drifted, and it is why deleting the folder would be wrong.

Deleted with the page: `RaidsSection`, `HubCards`, `ShipHeroSection`, `CampaignMapOverlay`,
`ExpeditionsTour`, `CaptainsOrders`, `tourActions`.

**Before deleting anything else in there, check who imports it** — most of it is the sea's.

## The score ladder

- Ladder + level: `web/lib/expeditions.ts`, `web/lib/expeditionLevel.ts`
- The shared 0-100 scale is the invariant. If a new activity wants to grant expedition
  score it must map onto that scale rather than getting its own meter.

## Connects to

- [ocean-hub.md](ocean-hub.md) — where all of it lives now. **Read this first.**
- [voyages.md](voyages.md), [raids-campaign.md](raids-campaign.md) — the two feeders.
- [progression.md](progression.md) — Navigation level gates most of this side.
