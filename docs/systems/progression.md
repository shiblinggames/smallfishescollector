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
