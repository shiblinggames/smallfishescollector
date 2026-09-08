# Crew

Recruit, level, assign, train, and (rarely) bury sea-creature crew. The connective tissue
between fishing (trawls), voyages, raids, and gauntlets.

## Where it lives now: the panel, not the page

**`/crew` is a redirect.** The Crew Management page — five tabs, its own column, its own
title, its own guided tour — is gone. Everything it did happens on the sea:

- **`sea/CrewHub`** is the crew panel, opened from the HUD disc. It shows a one-line roll
  call you can expand (who is out, who is due, who is idle — the panel's original job) and
  then **four painted cards**: Assign, Recruit, Roster, Skins. Pressing one draws that
  section inside the same panel with a back arrow in the header. Not a tab bar: five words
  in a row made five equal things out of four rooms that feel nothing alike, and the page
  needed a guided tour to explain itself.
- **`sea/HallSheet`** is the fifth room, and it is **ashore at the Crew Hall island**. The
  hall's tier, the Drills/Stores ladder and the bunks are the *building*; upgrading it from
  the middle of the ocean would make the island scenery. It wears `/crew-bg.jpg`, the
  painting the page had.
- **The Fallen** is a toggle inside Roster (it always was — it lost its tab long ago). With
  the tab bar gone it needed a way BACK, so the memorial carries one.

**Inside the panel, the rules the revamp settled:**

- **The roll call names five states, and `bunk` is not `hall`.** "In the hall" used to mean
  both *training in the Crew Hall* and *doing nothing*, which are the two states a captain
  most needs to tell apart — and there is a real hall on the chart, so it read as a place.
  Training is its own group with its own clock (off `crew_hall_bunks`, same table the hall's
  tiles read) and the idle are **Inactive**.
- **No voyage-board or trawl links at the foot.** Both are their own panels on the chart with
  their own way in; a second door to each turned four painted cards into a page of links.
- **The recruit dot clears when you open the board**, not when the board empties. The dot
  means "something here you have not dealt with"; looking and deciding not to sign anybody is
  dealing with it. Session-only — the board rolls daily and tomorrow you should be told again.
- **One accent for both parties.** They were a red card and a blue card; colour-coding is for
  telling things apart in a crowd, and there are two, stacked, each with its name on it. The
  red also read as a warning. Both take the crew's parchment gold and the labels do the work
  (`Raid Party` / `Voyage Party`).
- **Every filter looks the same** (`FILTER_LABEL` / `FILTER_FIELD`). The roster's sorts took
  their colour from the sort KEY, so the pair changed hue as you used them; the Trunk's
  dropdowns were cyan because skins were once cyan. Colour is left for the things that are
  about colour — a rarity dot, the chase toggle when lit.
- **The reroll buttons wear what they spend.** The plain reroll was blue, a colour this game
  uses for nothing purchasable; it takes the gem's purple, blood tiers keep blood.
- **`DAILY_RECRUITS` is 3 for everybody.** It was 3 for a Captain and 2 for everyone else — a
  thin perk on a board whose weights make it a common nine times in ten, and it meant the row
  was a different shape depending on who was looking at it.
- **The scroller clips sideways** (`overflowX: hidden`). The recruit reveal throws shock rings
  and particles past each card, which grew a horizontal scrollbar; the bar ate 15px, the cards
  reflowed narrower, the particles moved with them, and the panel juddered for the length of
  the animation.
- **Swipe-to-act is touch-only.** `SwipeAction` gates itself on `(pointer: coarse)` — asking
  what the primary input IS, not how wide the window is. Every action it wraps has a real
  button elsewhere, so a mouse loses a shortcut, not an ability.

**`CrewClient` was not rewritten.** It takes `embedded` (drops the 100vh ground, the 980
column, the title row, the back link, the tab bar and the guide) and `section` (makes the
tab controlled, with the prop-sync effect a prop-fed `useState` always needs). Every tab
body, every action, the trait offers, the compare sheet, the blood market, the crate reveals
and the bunk stints are untouched — rebuilding four and a half thousand lines in a new file
would have produced nothing visible except the bugs.

Both doors mount it lazily (`next/dynamic`, `ssr: false`): the chart holds the panel for the
whole session, and a static import would put the recruit board and the crate reveal in the
sea's bundle for every captain who never opens it.

**Links survive.** About thirty point at `/crew` (every crew badge, the captain's orders,
the gauntlet). The route maps the old `?tab=` to `/sea?open=crew&card=…`, because those
links are errands — *go and sign somebody on* — not addresses, and landing them on the four
cards would lose the point of following one. `tab=hall` has no card: a URL cannot sail you
to an island.

## Files

`web/lib/crew*.ts` is the family: `crewData` (definitions), `crewGen` (rolls),
`crewClasses` (abilities), `crewLevel` (curve), `crew-traits`, `crewSkins`, `crewEffects`,
`crewResolve`/`crewMuster` (combat contribution), `crewHall`/`crewBunks`/`crewBunkSettle`
(training), `crewAssignment`, `crewCapacity`, `crewXPGrant`. UI:
`web/app/(app)/crew/` (CrewClient, AssignBoard, AssignPicker, HallBunks, actions,
bunkActions) plus its two hosts on the water, `web/app/(app)/sea/CrewHub.tsx` and
`web/app/(app)/sea/HallSheet.tsx`.

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
