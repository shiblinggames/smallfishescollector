# The Chart Room & World Chart

Weekly puzzle wing off the tavern: four rotating puzzle types earn `puzzle_points`,
which advance the World Chart — a long-arc landmark map paying escalating gems.

## Files

- Lobby + puzzle cards: `web/app/(app)/tavern/chart-room/` (hold, rigging, minefield,
  treasure-match; the expedition-side puzzle components — Beacon/Cargo/Cipher/Mirror/
  Tumbler — live under `web/app/(app)/expeditions/`)
- The chart: `web/lib/worldChart.ts` (landmarks, thresholds, gem totals — read, don't
  restate)
- Verifier scripts for puzzle solvability: `web/verify-cargo.mjs`, `verify-mirror.mjs`,
  `verify-tumbler.mjs`

## Design rules

- **Puzzle boards grow VERTICALLY on phones.** Portrait is the layout axis; a puzzle
  that scales by widening breaks on the primary device class.
- Weekly cadence with no expiry punishment — miss a week, the chart waits (evergreen
  pillar). The World Chart is a finite ladder, not a treadmill.
- New puzzle types need a solvability verifier script like the existing three; a weekly
  puzzle that generates unsolvable is a support fire.

## Connects to

- [tavern.md](tavern.md) — entry point. [economy-membership.md](economy-membership.md)
  — the gem ladder.
