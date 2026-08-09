# Badges & Achievements

Badges are SKILL TIERS (rookie → seasoned → veteran → master), not rarity. The complete
add-a-badge runbook lives in **`web/BADGES.md`** — follow it end to end; this doc holds
the rationale and the traps around it.

## Files

- Registry + tier meta: `web/lib/badges.ts` (rewards/points derive from tier — never set
  per badge)
- Earnability: `web/lib/badgeConditions.ts`, grant machinery `web/lib/badgeGrant.ts`
- Points board: `web/lib/achievementPoints.ts`; page `web/app/(app)/badges/`
- Art pipeline: `slice-badges.mjs` (repo root) slices uploaded sheets into
  `web/public/badges/`

## Traps that have each shipped as a silent bug

- **`BADGE_PROFILE_COLUMNS` must list every profile column any badge reads.** A badge
  keyed to an unlisted column evaluates against `undefined` and is silently unearnable.
  When a new system adds profile counters, extend the list in the same commit.
- **Stat-extractor helpers must match the CURRENT data shape.** When a system is rebuilt
  (e.g. the Exchange), its badge extractor must be re-pointed at the new status values
  or the badge dies quietly. Grep `badgeConditions` for the system name on any rebuild.
- **The Achievement Points leaderboard is computed LIVE** from earned conditions, not
  from the stale `unlocked_badges` snapshot. Don't "optimize" it back to the snapshot.
- The check script `web/scripts/check-badge-goals.mts` enforces that every registered
  badge is listed on /badges — run `npm run check` after badge work.

## Art

Badge sheets are generated from the reusable 6-per-sheet prompt (house style; never draw
counts as digits in the art — the frame carries the number). See
[cosmetics-and-art.md](cosmetics-and-art.md) for the full art pipeline and style lock.
