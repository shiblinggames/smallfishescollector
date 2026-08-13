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

## Connects to

Every gate in the game points here. [badges.md](badges.md) reads the same counters.
