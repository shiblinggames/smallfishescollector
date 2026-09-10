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
- **The unlock toast goes over everything, and both halves of that matter.** A badge is
  granted by a thing you DID, and the doing happens inside whatever is on top at the time:
  a raid, a gauntlet, a cutscene, a crate opening, a sheet over the sea. It sat at
  `zIndex: 70` — above the nav and below every one of those — so the moment worth
  celebrating was the moment it was covered. It is `createPortal` to `document.body` now
  (rendered in the app tree, `position: fixed` resolves against the nearest TRANSFORMED
  ancestor, so one animating parent could trap it inside a card) at z 100010, above the
  app's previous ceiling of 100000.

## The ocean hub's four tables (2026-09)

Thirty badges cover the Salt Road, the homestead, the isles, the digs and the fog. Four of
those five keep their state in their OWN tables (`sea_rapport`, `homesteads`,
`sea_discoveries`, `sea_digs`), not on the profile row, so `BadgeJoinData` gained a required
`sea: SeaStats` field folded by one shared `seaStatsFrom()` — the same pattern
`exchangeStatsFrom` set, and required for the same reason `crew.effects` is: four callers
build that object and the compiler has to find the one that forgets.

- **Thresholds are imported, never copied.** `TIER_AT` (the rapport curve), `ISLES`,
  `DIG_SITES`, `HOUSE` and `FURNITURE` all come from their own modules. The rapport curve has
  already been retuned once (4/10/18/30 became 4/14/34/70); a badge holding its own copy would
  have gone on paying out at the old friendship.
- **The fog badges cap at 90%, not 100%.** A grid cell can sit under an island, so a badge
  needing every last square could be unfinishable. Both masks score against the cells that
  were ever fogged (`WATER_CELLS`, `FOGGABLE_CELLS`) rather than the whole rectangle, or a
  completionist reads as 40%/80% and it looks like a bug.
- Both mask columns are precomputed at import because the points board decodes them for
  **every** player; do not put the trig back inside the per-player loop.
- `you_remembered` is the only hook of the thirty: `gifts_given` counts presents and nothing
  records which fish each was, so the answer only exists at the moment it happens. It fires in
  `folkActions` AFTER the fish is confirmed taken, because everything above that line can
  still hand the day back.

## Art

Badge sheets are generated from the reusable 6-per-sheet prompt (house style; never draw
counts as digits in the art — the frame carries the number). See
[cosmetics-and-art.md](cosmetics-and-art.md) for the full art pipeline and style lock.
