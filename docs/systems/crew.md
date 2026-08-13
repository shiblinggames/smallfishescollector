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
- **Roster capacity comes from BOTH Navigation and the hall tier** —
  `web/lib/crewCapacity.ts` is the only source, and every caller must pass the hall tier
  or it silently under-counts. This reverses the bunkhouse plan's call that capacity is
  Nav's job alone: that held while a bigger bench had nothing to do, and stopped holding
  once bunks existed. It rides on hall tiers rather than a standalone purchase so more
  roster and more training always arrive together, never "pay for more bench".
- **Naming: three different capacities, three different words.** A *bunk* is a training
  slot in the hall, a *berth* is a ship deployment slot (`has_sixth_berth`), *roster* is
  how many crew you may own. Expanded Quarters is a Chapter 4 armory augment and is none
  of the three. Do not reuse any of these for a fourth thing.
- **The Leviathan bunk is exempt from the level gate.** Ordinary bunks pay XP, so
  `canBunk` turns away a hand at the ceiling; the deepest bunk pays a trait re-cut
  instead, and a maxed hand is exactly who wants one. The gate is slot-aware for that
  reason — see the comment on `canBunk` before "simplifying" it.
- **Leveling is geometric** (`web/lib/crewLevel.ts` holds the curve); raids grant FULL
  crew XP. Stats are roll-affinity ratios ("skews"), not additive bonuses — per-fish
  archetypes bias which stat a recruit rolls high.
- **Crew death is final.** Voyage risk and hardcore gauntlets depend on it. No revival.
- The Crew Hall's bunk training replaced the old start-level perk: a hall tier buys a
  bunk AND roster slots, recruits always arrive at level 1. Recruit board is a daily
  roster; legendary recruits are campaign-gated (`web/lib/legendaryUnlocks.ts`).
- **Traits are one stat triple per crew** (`crewEffects`), labelled by net and sign. Only
  the Leviathan bunk's deep roll reaches magnitude 4, so the top labels exist purely to
  make that chase legible — a hand used to read "Demigod" from its first all-3s until the
  moment it turned Divine. The re-cut merges per stat with `Math.max`, which is why it can
  only ever raise a number and why a trait-less crew can never come out of it worse.
- Skins: legendary gem-purchases (`web/lib/crewSkins.ts`), chase skins get full glow +
  `ChaseSkinFx` animation wherever the crew appears — including the assign board.
- Crew are grouped into habitat tiers for backdrops (`web/lib/fishGroups.ts`).

## Connects to

Everything: [trawls.md](trawls.md), [voyages.md](voyages.md),
[raids-campaign.md](raids-campaign.md), [gauntlets.md](gauntlets.md),
[story-universe.md](story-universe.md) (legendary recruits),
[cosmetics-and-art.md](cosmetics-and-art.md) (skins).
