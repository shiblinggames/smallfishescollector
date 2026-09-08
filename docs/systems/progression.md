# Progression — Levels, Renown, Prestige, Dailies

The XP spines everything gates on: Fishing level, Navigation level, Renown past the cap,
fishing Prestige, and the daily challenge cadence.

## Files

- Curves: `web/lib/fishingLevel.ts`, `web/lib/navigation.ts`; rewards
  `web/lib/levelRewards.ts`
- **Renown: `web/lib/renown.ts` tunes ALL of it** — the post-cap paragon track for both
  Fishing and Navigation lives in this one file by design.
- Prestige: implemented in `web/app/(app)/fishing/actions.ts` (no dedicated lib)
- Daily challenges: `web/lib/dailyChallenges.ts` + fishing `dailyChallengeActions.ts`

## Rules

- **Two parallel spines, deliberately.** Fishing level gates the fishing half;
  Navigation gates the expedition half. Neither converts into the other.
- **Renown is post-cap only** and intentionally modest — it exists so max-level play
  still ticks, not to reopen power growth.
- **A renown stat has to answer the player who is actually buying it.** Everyone spending
  these points has already finished the level curve and the gear ladder, so anything that
  sells *consistency* is selling them something they own. Fishing's Precision (a wider
  catch band) drew literally zero points across every post-100 captain before it was
  replaced. Check the live allocations before adding or tuning one; a boycott shows up
  there long before anyone files it as feedback.
- **Price a renown stat against the thing it competes with**, not in the abstract. The
  crate stat is quoted against the Treasure Rod because that is the crate bonus players
  already understand. Watch what it MULTIPLIES with: rod, Primeval Eye and renown all
  stack on the same crate roll, and the ceiling is the number to sanity-check, not the
  per-point one.
- **Allocation is undone only by a respec token** (`renown_respecs`, one per board,
  buyable for gems). Retiring a stat is therefore safe without a migration: `spentPoints`
  only counts ids still in the catalog, so points in a removed stat return as banked
  rather than vanishing.
- **Prestige is hard-capped** with fixed perks (doubloon multiplier + catch XP boost —
  values in code). It grants NO sell bonus; that was rejected to keep prestige from
  compounding into the economy.
- **Grant unlocks on STATE, not on crossing** — every "unlocks at level N" check is
  `level >= N` evaluated whenever seen. See [gear.md](gear.md).
- **Daily challenges**: a fixed number per day (a bonus slot at high level), full-sweep
  bonus paid in gems on claiming all. Evergreen: missed days simply pass, no streak
  punishment (pillar: no FOMO mechanics, ever — no seasons, no battle pass, no P2W).

## The two spine panels

**Each half of the sea has a HUD disc that opens everything about its level**
(`sea/SkillPanel.tsx`): a rod south of the reef for Fishing, a ship's wheel north of it for
Navigation. One slot, never both — a captain in the Shallows has no use for a hull's HP curve
and one in a bay cannot fish.

Until this there was a BAR and nothing else: a number, a fill, and past 100 a chip that opened
the renown allocator. A bar says how far along you are and nothing about what being there is
worth. The panel answers four questions — what it takes to reach the next level, what this one
pays you now, what the next one changes, and what is waiting further up.

**A stat is one fact with a trajectory, not two facts.** The first cut had a block for what
your level gives you and a second for what the next one gives, and the second was mostly the
first with different numbers — Catch band, Crew stats and Berths each appeared twice, three
lines apart, to be diffed by eye. Worse, four levels in five the honest answer was `+0`, so the
block existed to say nothing. A stat gets ONE row carrying the arrow: `+8° → +9° at 45`. What
is left over — a water opening, a hull, a milestone payout, a campaign gate — is not a stat at
all; those are EVENTS at a level, and they get a list of the next three, whatever kind they
are. Anything already on a stat row is deliberately absent from it.

**The explanations are behind a tap.** Every stat has a sentence and those sentences were most
of the text on the screen: ten rows, two lines each, before you reached anything. One at a
time, on the row itself.

**Every number in it is DERIVED**, from the same functions the game plays by: `levelCatchBonus`,
`navLevelBonuses`, `crewCapacity`, `rewardForLevel`, the zone table's `minLevel`, and the gear
and hull gates in `gearGating`. Nothing is a hand-typed copy of a rule that lives elsewhere —
a panel that explains the rules is the worst place in the codebase for a number to drift,
because it is believed. If you add a level effect, add it to the rows here in the same commit.

**Renown's door is here now.** It used to hang off the MAX chip on the fishing XP bar, which is
visible only to a captain at 100 and only while the rod is out — and the expedition side had no
door at all, so Nav points earned by voyages and raids were unspendable without sailing home to
a fishing bar. `RenownPanel` is unchanged and already took a `skill`; the panel opens it with
the side you are on. The disc wears the amber dot when either spine has points banked.

## Connects to

Every gate in the game points here. [badges.md](badges.md) reads the same counters.
