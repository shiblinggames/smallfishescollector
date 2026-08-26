# Story Universe — "The Sunken Hand"

The four-chapter campaign arc delivered through raid map story nodes, cutscenes, and one
finale. The bible for who knows what and when.

## The master twist (SPOILER — the whole arc hangs on it)

**Finn — the friendly guide fish — runs the Finndicate.** The reveal is seeded across
chapters and must never be leaked early by incidental copy. Anything Finn says pre-reveal
is written in innocent voice; re-read `web/lib/finn.ts` and `web/lib/finnItems.ts` before
giving Finn new lines anywhere (the encounter panel is
`web/app/(app)/fishing/FinnEncounter.tsx`, the ancient-catch cutscenes are `FinnScene.tsx`).

**Finn is found, not rolled.** He used to arrive on a 2% chance per cast on the fishing
screen. He now stands out on the sea chart and you sail to him: one meeting, one beat, and
he is somewhere else afterwards. `FINN_ENCOUNTER_RATE` is 0 and the old roll sites in
`FishingGame.tsx` are dead — the story only advances on the water now. See
[sea-npcs.md](sea-npcs.md) for the mechanics.

- The six Ancient Deep giants gate a late raid — collecting them is a campaign key, not
  just an almanac flex.
- The finale ("One Last Ride") ships as gate + cutscene + boss; a dial-based combat
  variant for it was designed but NOT built.
- Chapter 4 / endgame is LIVE (de-gated 2026-07-04; the raidMap comments record it).

## Delivery machinery

- Story nodes live in the raid chain (`web/lib/raidMap.ts`, nodes with `scene[]`).
- Cutscenes use a shared kit with the "living crew" ensemble — legendary crew appear
  across chapters as recurring cast (`components/` cutscene pieces, StoryScene in
  expeditions). Chapter unlocks get a one-time parchment celebration overlay.
- Legendary crew recruitment is campaign-gated: specific story nodes unlock specific
  recruits (`web/lib/legendaryUnlocks.ts`).

## Voice and naming rules (hard rules, from repeated review)

- Bosses/NPCs are named with serious-but-funny PUNS (spoonerism-flavored); grep the
  codebase to confirm a name is unused BEFORE proposing it.
- The cast are sea creatures — never "men", "humans", or land idioms.
- Copy voice everywhere: epic + pirate charm, NO em-dashes, nothing AI-sounding. But
  copy whose JOB is explaining a mechanic goes plain and literal instead (see
  [platform.md](platform.md) conventions).

## Connects to

- [raids-campaign.md](raids-campaign.md) — the delivery vehicle.
- [crew.md](crew.md) — legendary recruits are story rewards.
- [bounties.md](bounties.md) — the Don is the elite bounty and a campaign character.
