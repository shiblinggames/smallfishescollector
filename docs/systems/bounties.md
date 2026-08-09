# Bounties

Daily gem-paying hunt targets, one rung unlocked per campaign chapter, topped by the
elite bounty (the Don). This is the game's competitive-flavored ladder — it REPLACED
ship PvP (removed 2026-08) and inherits its role; don't rebuild PvP alongside it.

## Files

- Board + payouts: `web/lib/bounties.ts`
- Ranks: `web/lib/bountyRanks.ts` — lifetime-points medallion ladder (art under
  `public/bounty/ranks/`, generated in the house pipeline)
- UI: `web/app/(app)/expeditions/BountiesPanel.tsx`, `bountyActions.ts`

## Design shape

- Rungs are CHAPTER-gated, not level-gated: campaign progress is what widens the daily
  gem faucet. The per-rung amounts live in `lib/bounties.ts` — never restate them.
- Ranks are lifetime-cumulative and purely honorific (title + medallion + glow). They
  deliberately carry no gameplay bonus, so the ladder can't become pay-to-climb.
- The claim modal is a celebration, not a spreadsheet — keep the reveal feel if
  redesigning.

## Connects to

- [story-universe.md](story-universe.md) — the Don. [economy-membership.md](economy-membership.md)
  — the gem faucet. [badges.md](badges.md) — bounty badges read profile columns (they
  must be listed in `BADGE_PROFILE_COLUMNS` or they silently never earn).
