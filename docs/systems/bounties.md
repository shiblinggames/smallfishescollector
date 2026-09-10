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

## Two frames, one set of clothes (2026-09-10)

The board is a **section of the Navigation level** (`SkillPanel.extra`) and **its own panel at the
Posting House** (`BountyBoardModal`). Mooring at the island briefly opened the whole level panel —
your level, your renown, your road ahead, and the notices somewhere down it — which is not what a
captain sails to the Posting House for. It opens the board on its own again.

`BountyBoardModal` now wears the **level panel's shell**: the same ground
(`linear-gradient(...) , rgba(8,12,18,0.98)`), the same `rgba(196,169,106,0.34)` hairline, radius 20,
`maxHeight: min(80vh, 620px, 100%)`, a Cinzel title with the gold eyebrow, and `CloseButton`. It was
a painted oak plate, which read as a different feature holding the same notices. `BountiesPanel` is
drawn `embedded` in both, so the header is the frame's in each case.

The island's building went 0.28 → 0.34. `scale` is a fraction of the *island's* diameter and this
isle is r 280 against the Gunwharf's 340, so an equal-looking number drew a visibly smaller
building (157px against 245).
