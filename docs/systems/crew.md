# Crew

Recruit, level, assign, train, and (rarely) bury sea-creature crew. The connective tissue
between fishing (trawls), voyages, raids, and gauntlets.

## Files

`web/lib/crew*.ts` is the family: `crewData` (definitions), `crewGen` (rolls),
`crewClasses` (abilities), `crewLevel` (curve), `crew-traits`, `crewSkins`, `crewEffects`,
`crewResolve`/`crewMuster` (combat contribution), `crewHall`/`crewBunks`/`crewBunkSettle`
(training), `crewAssignment`, `crewCapacity`, `crewXPGrant`. UI:
`web/app/(app)/crew/` (CrewClient, AssignBoard, AssignPicker, HallBunks, actions,
bunkActions).

## Structural rules

- **One track only**: `user_crew_one_track_only` CHECK — a crew holds a voyage slot OR a
  raid slot, never both. Slot 0 is captain at full weight; other seats contribute at a
  reduced multiplier (the breakdown UI proves the sum on tap).
- **Seated / trawling / bunked are mutually exclusive BY CONSTRUCTION**: starting a trawl
  benches the crew; bunking refuses a seated crew; a bunk is held until its XP is
  CLAIMED (not merely until the stint timer ends), so a finished-but-uncollected hand
  still can't be seated. `clearParty` relies on this to skip per-crew checks — if you
  weaken any leg, revisit all consumers.
- Reassignment guards live in `assertCanReassign` (`crew/actions.ts`): pending voyage,
  trawl, bunk. Bulk clear adds the open-gauntlet lock for the campaign party.
- **Leveling is geometric** (`web/lib/crewLevel.ts` holds the curve); raids grant FULL
  crew XP. Stats are roll-affinity ratios ("skews"), not additive bonuses — per-fish
  archetypes bias which stat a recruit rolls high.
- **Crew death is final.** Voyage risk and hardcore gauntlets depend on it. No revival.
- The Crew Hall's bunk training replaced the old start-level perk: hall tiers buy bunks
  (training slots), recruits always arrive at level 1. Recruit board is a daily roster;
  legendary recruits are campaign-gated (`web/lib/legendaryUnlocks.ts`).
- Skins: legendary gem-purchases (`web/lib/crewSkins.ts`), chase skins get full glow +
  `ChaseSkinFx` animation wherever the crew appears — including the assign board.
- Crew are grouped into habitat tiers for backdrops (`web/lib/fishGroups.ts`).

## Connects to

Everything: [trawls.md](trawls.md), [voyages.md](voyages.md),
[raids-campaign.md](raids-campaign.md), [gauntlets.md](gauntlets.md),
[story-universe.md](story-universe.md) (legendary recruits),
[cosmetics-and-art.md](cosmetics-and-art.md) (skins).
