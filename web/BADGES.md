# Adding Badges — Runbook

The single source of truth for adding achievement badges. Badges are **skill tiers**
(rookie → seasoned → veteran → master), NOT rarity. Follow this end to end and a new
badge will: show on the Badges page with live progress, self-grant via reconcile,
pay its doubloon reward on claim, and count toward the Achievement Points leaderboard.

> Quick mental model: **register it** (lib/badges) → **make it earnable** (one of three
> wiring types) → **show it** (badges/page) → **draw it** (slicer + a sheet) → **ship it**
> (tsc → commit → push).

---

## 0. The tiers (fixed — don't invent new ones)

| Tier | Reward (⟡) | Points | Accent |
|------|-----------:|-------:|--------|
| `rookie`   | 250    | 1 | green  |
| `seasoned` | 1,000  | 2 | blue   |
| `veteran`  | 5,000  | 3 | purple |
| `master`   | 10,000 | 4 | gold   |

Defined in [`lib/badges.ts`](lib/badges.ts) (`BADGE_REWARD`, `BADGE_POINTS`, `DIFFICULTY_META`).
Reward/points are derived from the tier — you never set them per badge.

**Tier the badge by how hard it actually is to reach _today_.** Check real player
ceilings before picking a threshold (e.g. `select max(col) from profiles where is_admin=false`).
A milestone nobody can hit yet is a dead entry — see the 2026-06 notes where charting/raid-dmg
caps were too low to badge.

---

## 1. Pick an id + decide the wiring type

- **id**: short `snake_case`, unique, stable forever (it's the DB key). e.g. `deep_trawler`.
- **Wiring type** — this is the only real decision. Three kinds:

### A) DERIVABLE (preferred) — a profile column / simple join already says so
The badge condition can be computed from stored state (a count, a level, an array length).
Examples: `master_angler` (fishing level), `wrecking_crew` (beacons ≥ 2000), `ship_of_the_line`
(`ship_tier ≥ 6`), `friend_at_sea` (`unlocked_pets.length ≥ 1`).

→ Add it to [`lib/badgeConditions.ts`](lib/badgeConditions.ts). This one file is the **single
source of truth** shared by reconcile (per-user grant) AND the Achievement Points leaderboard
(all-player live compute), so they can never drift. It self-heals: anyone who already qualifies
gets it on their next Badges-page visit, and it counts on the leaderboard immediately.

### B) HOOK — a "moment" event that stored state can't reconstruct
The thing happens and is gone (a streak that resets, a one-time event, a per-spin outcome).
Examples: `trophy_catch`, `catfish_jackpot`, `crowned`, `called_it`, `unstoppable`.

→ Call `await unlockBadge('your_id')` at the moment, in the relevant server action, wrapped in
`try {} catch { /* best-effort */ }`. `unlockBadge` lives in
[`app/(app)/achievements/badgeActions.ts`](app/(app)/achievements/badgeActions.ts) and is safe to
import into any other `'use server'` file. **Hooks are forward-only** — they don't grant
retroactively (a player who already did the thing won't get it until they do it again).

### C) NEEDS NEW TRACKING — no counter exists yet
Add a column, then it becomes type A or B.
- **Simple lifetime counter** → `alter table profiles add column ... int not null default 0`,
  then bump it where the event happens with the generic RPC:
  `void admin.rpc('bump_profile_stat', { uid: user.id, col: 'your_col', n: 1 }).then(()=>{},()=>{})`.
  Now it's DERIVABLE. (e.g. `trawls_collected`.)
- **Streak / non-monotonic** → add a column you `update` directly at the event (compute new value,
  reset on break), and fire a HOOK when it crosses the threshold. (e.g. `blackjack_win_streak`.)

Apply schema with the Supabase `apply_migration` tool (snake_case name), then run `get_advisors`
(security) — adding plain columns to the already-RLS'd `profiles` needs no new policy, but check
for surprises. See [`lib/badgeConditions.ts`] BADGE_PROFILE_COLUMNS — **add any new column there**
so both reconcile and the leaderboard select it.

> If unsure A vs B: can you answer "does this player qualify?" purely from a DB row at any later
> time? Yes → A. Only true at the instant it happens → B.

---

## 2. Register the badge — `lib/badges.ts`

Add one entry to the `BADGES` array (group it under the right comment block) and one blurb to
`BADGE_DETAIL` (the detail-modal "what it takes" text):

```ts
// in BADGES[]
{ id: 'deep_trawler', name: 'Deep Trawler', description: 'Collect 100 trawls',
  imageUrl: '/badges/deep_trawler.png', difficulty: 'veteran' },

// in BADGE_DETAIL
deep_trawler: 'Collect 100 trawls. A steady second income hauled up one cycle at a time.',
```

`imageUrl` is always `/badges/<id>.png`. Until art lands it falls back to a placeholder
automatically — that's fine.

---

## 3. Make it earnable

- **Type A (derivable):** in [`lib/badgeConditions.ts`](lib/badgeConditions.ts):
  1. add the field to `BadgeProfileFields` (if it's a new column),
  2. add the column name to `BADGE_PROFILE_COLUMNS`,
  3. add one line to the `badgeConditions(...)` return map: `deep_trawler: Number(p.trawls_collected ?? 0) >= 100,`.
  That's it — reconcile and the leaderboard pick it up with no other changes.

- **Type B (hook):** add `try { await unlockBadge('your_id') } catch {}` at the event site.
  Nothing to add in `badgeConditions`. (The leaderboard counts hook badges via the
  `union(stored, derived)` in [`lib/achievementPoints.ts`](lib/achievementPoints.ts) — stored
  covers hook-only ids automatically.)

---

## 4. Show it on the Badges page — `app/(app)/badges/page.tsx`

Derive the value (if not already), then add a `badgeGoal(...)` row to the right group (or add a
new group object). The helper signature:

```ts
badgeGoal(id, label, desc, current, target, href, opts?)
//   opts: { binary?: boolean; record?: boolean }
```

- **Derivable progress:** pass the real numbers — `badgeGoal('deep_trawler','Deep Trawler','Collect 100 trawls', trawlsCollected, 100, '/fishing')`.
- **Binary / hook badges:** use `{ binary: true }` and `has('id') ? 1 : 0` as current —
  `badgeGoal('crowned','Crowned','Make it all the way up the Pirate King ladder', has('crowned')?1:0, 1, '/tavern/trivia/king', { binary: true })`.
  (`has()` reads the reconciled `unlocked` list; hook badges only flip once earned.)
- `href` is where "Take me there" sends the player.
- Adding a new category? Push a new `{ title, accent, goals: [...] }` object. The title becomes a
  filter option in the Category dropdown automatically.

`getCurrentProfile()` selects `*`, so any profile column is already on `profile` — just read it.

---

## 5. Art — slicer + nano-banana

Art ships in **6-badge sheets** (3 columns × 2 rows). The slicer
[`slice-badges.mjs`](slice-badges.mjs) cuts each `public/badgebatch<N>.png`, finds each emblem's
true alpha bounding box, re-centers it on a square canvas, and downscales to 256px. Source sheets
are **gitignored** (`public/badgebatch*.png`); only the sliced `public/badges/<id>.png` is committed.

1. **Map the cells** in `slice-badges.mjs` `PLAN` — `[batch, row, col, id]`, read order = row 0
   L→R then row 1 L→R. Start a fresh batch number when the last sheet is full.
2. **Generate the sheet** with the nano-banana prompt template below, save as
   `web/public/badgebatch<N>.png`.
3. **Slice:** from `web/`, `node slice-badges.mjs`. It skips batch sheets that aren't uploaded
   yet (so partial batches are fine) and prints each emblem's centered size.
4. **Eyeball** (optional but recommended): build a quick contact sheet with red crosshairs at cell
   centers to confirm centering before committing (see git history for the one-liner).

### Nano-banana prompt template

> A 3-column by 2-row grid of 6 circular pirate achievement badge emblems, hand-painted game-art
> style, soft painterly shading with a beveled metal rim, each medallion centered in its cell with
> generous transparent margin. **Transparent background. No text, no numbers, no letters.**
> Consistent lighting and medallion size across all six. Metal tier: bronze = humble (rookie),
> silver = accomplished (seasoned), gold = elite (veteran), ornate jeweled gold = legendary (master).
>
> Left-to-right, top row then bottom row:
> 1. **<Name>** (<metal>) — <one-line visual: a clear single icon/scene>.
> 2. … (six total, matching the PLAN cell order exactly)

Keep each emblem to one legible icon/scene; map the metal to the badge's tier; never request text
or numbers (the model renders them garbled).

---

## 6. Verify + ship

```bash
cd web && node_modules/.bin/tsc --noEmit      # must be clean
# if you ran a migration: get_advisors (security) — expect only the known backlog
git add -A
git commit -m "Badges: <what> ..."            # end with the Co-Authored-By trailer
git push origin master                         # push = Vercel auto-deploy
```

Badges work the moment code ships — art is independent (placeholder until the sheet lands). Derivable
ones light up on the next Badges-page visit / leaderboard read; hook ones from the next event.

Consider a broadcast mail for a sizable batch (get copy approval first — see the mail-system memory).

---

## File map

| Concern | File |
|---|---|
| Badge registry + tiers + rewards + detail blurbs | [`lib/badges.ts`](lib/badges.ts) |
| Derivable conditions (shared by reconcile + leaderboard) | [`lib/badgeConditions.ts`](lib/badgeConditions.ts) |
| Per-user grant on Badges-page visit | [`app/(app)/achievements/badgeActions.ts`](app/(app)/achievements/badgeActions.ts) → `reconcileBadges`, `unlockBadge`, claim RPCs |
| Achievement Points leaderboard (all-player live compute) | [`lib/achievementPoints.ts`](lib/achievementPoints.ts) |
| Badges page (groups, rows, hero, filters) | [`app/(app)/badges/page.tsx`](app/(app)/badges/page.tsx) + `app/(app)/achievements/AchievementsClient.tsx` |
| Earned-badge popup | `components/BadgeWatcher.tsx` + `BadgeUnlockedCelebration.tsx` |
| Art slicer + PLAN | [`slice-badges.mjs`](slice-badges.mjs) |

## Gotchas

- **Reward ≠ earned.** Points/earned-state count when a badge is **earned**; claiming only writes
  `claimed_badge_rewards` and pays the doubloon bonus. Never gate points on claim.
- **Leaderboard is live, not the snapshot.** It scores `union(stored unlocked_badges, derived)` per
  player so it never goes stale — which is exactly why DERIVABLE conditions must live in
  `lib/badgeConditions.ts` (not inline anywhere).
- **Hook badges aren't retroactive.** If you need to backfill past achievers, that's a separate
  one-off — the hook only fires on the next occurrence.
- **New column? Add it to `BADGE_PROFILE_COLUMNS`** or the leaderboard/reconcile won't select it.
- **Three historical hook-only ids** can't be derived and rely on stored state: `trophy_catch`,
  `catfish_jackpot`, `full_collection`. The `union` in the leaderboard is what keeps them counted.
- **Copy voice:** no em-dashes, no AI-sounding filler, pirate charm; serious-but-fun names. No emoji
  as icons (the 🏅 fallback is temporary art only).
- **Commit the sliced PNGs**, never the source `badgebatch*.png` (gitignored).
