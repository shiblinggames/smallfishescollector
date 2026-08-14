# Gauntlets — Davy Jones & The Don

Push-your-luck roguelike towers built on the raid combat engine. One run a day; each depth
raises stakes; cash out or press on. The main repeatable endgame.

## Files

- **`web/lib/gauntlet.ts`** — depths, offers, upgrades, the run state model. The other
  `gauntlet*.ts` libs (Contracts, Marks, Merchant, Offer, Terms, Upgrades) hang off it.
- Run actions: `web/app/(app)/raids/gauntlet/actions.ts`; Don's variant under
  `raids/dons-gauntlet/`.

## The run state model (get this right or corrupt runs)

- **Starting a run consumes the attempt** — not finishing it. Quit-retry cannot reroll a
  bad opener.
- The run lives on `profiles` columns (`gauntlet_run_*`). **`gauntlet_run_open` stays
  true while paused** — `gauntlet_run_paused` is a sub-state of open, not a sibling.
  Any "is a run in progress" check needs only `gauntlet_run_open`.
- **Crash recovery is checkpoint-based with server-owned resume.** The client never
  reconstructs a run from local state.
- An open run LOCKS the campaign party (bulk-clear and reassignment both refuse).

## Run timing and depth splits

- `profiles.gauntlet_run_active_ms` is ACTIVE time, not wall clock: `tickActiveMs()` folds
  each gap in capped at 5 minutes, and a deliberate pause stops the clock outright. A finished
  run lands one row in `gauntlet_runs`.
- **Per-depth personal bests** live in `gauntlet_depth_bests`, keyed
  `(user_id, variant, hardcore, depth)`. A breather opens exactly once per depth right after
  it falls, so the clock the checkpoint just wrote IS the time to reach that depth — there is
  no separate measurement, and the depth comes off server-persisted state.
- **The table is bounded on purpose**: the natural key caps a player at 400 rows forever, so
  writes become pure UPDATEs. Do NOT switch this to a per-run splits log — that grows without
  limit for the same feature.
- `record_gauntlet_depth_best()` keeps the FASTEST and returns `(prev_ms, is_record)` so the
  breather can draw a ghost with no extra round trip. A first visit returns `prev_ms = null`
  and `is_record = false`: there is nothing to have beaten, and the descent is already its own
  moment. The client keeps the FIRST split per depth, because a pause-and-resume re-checkpoints
  the same depth against the record it just set.
- Keyed by variant AND hardcore because those descents are not comparable. Deliberately NOT a
  global leaderboard: builds differ run to run, so a fast split can mean a lucky draft rather
  than better play. Personal ladder only.

## Variants and layers

- **Don's Gauntlet (G2)** is live with its own Locker and records, parallel to Davy's.
- **Hardcore**: the squad is snapshotted at start and PERMANENTLY dies on death/abandon
  (the Drowned Ledger memorializes them). Crew death being final is a pillar — voyage
  risk and hardcore both depend on it; never add revival.
- **Davy's Terms**: hardcore-only opt-in difficulty knobs; Pressure scales the Blood Gem
  multiplier.
- **Blood Gems** drop from hardcore chests; spent on the blood reroll and the skin
  gamble. **Don's Contracts** are opt-in jobs with reward AND penalty.
- Synergy cues: resolve-step effects map to playback FX in RaidCombat — a synergy that
  fires silently reads as a no-op, so every new one needs its cue.

## Boon design rules

- **Two cards must answer different QUESTIONS, not sit at different dial
  positions.** Kraken's Grip was a second "chance on hit to skip a turn" beside
  Permafrost, so the only difference was the number. It is now deterministic —
  every landed hit adds a stack, the n-th drags the hull under — against
  Permafrost's coin flip, and it damages the enemy independently of your guns
  where Permafrost amplifies them. If a new boon can be described as "like X but
  more", it needs a different verb, not a bigger number.
- **Price effects off something that grows with the depth curve.** Grip's crush
  is a share of the ENEMY's max HP, so it keeps pace for free and makes good on
  the card's boast that bosses are not immune (a boss carries 2.8x the hull, so
  it takes 2.8x the crush). Anything denominated in a flat player quantity goes
  stale at depth — the mistake the lifesteal cap made, see
  [raids-campaign.md](raids-campaign.md).
- **A legendary should not be able to whiff a whole fight.** Determinism is the
  fix; it also makes the effect legible, since the log can narrate the count.
- **Per-fight state resets per fight.** Grip's stacks are the coils around THAT
  hull, so a fresh enemy starts clean rather than inheriting a nearly-full
  counter and handing out a free proc on the opening hit.
- **A confluence must not be the only thing giving its halves a personality.**
  Deep Terror used to supply the damage Kraken's Grip lacked, so the base card
  was only interesting once you also held Permafrost.
- Effect copy is generated from the effect where possible (`lib/tides.ts`
  describes each kind), so a retune cannot leave stale numbers on a card.

## Connects to

- [raids-campaign.md](raids-campaign.md) — same combat engine, same laws.
- [crew.md](crew.md) — party lock, hardcore death. [forge.md](forge.md) — loot feeds it.
