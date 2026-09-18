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

## The cash-out is held against the clock (2026-09-15)

`cashOutGauntlet` takes the depth and the pot from the client and clamps them to the
economy caps, and for a long time that was the whole check: a request naming the cap paid
the cap, and the normal gauntlet has no run cap or cooldown, so `start, cash out, repeat`
was an infinite money loop for anybody with Postman. Two testers have used Postman against
other actions already.

**The floor.** `gauntlet_run_active_ms` is the one fact about a run the server keeps for
itself (accumulated from timestamps `tickActiveMs` writes, idle gaps capped at five
minutes). The paid depth is now `min(client depth, floor(active_ms / 4000))`. Four seconds
a depth is half the fastest honest depth on record (`gauntlet_depth_bests`: nine seconds
for depth one, over twenty-five a depth past ten), so it cannot touch a real player. The
combat depth may exceed the reward depth by exactly the Veteran's Start head start
(`gauntletStartDepth() - 1`), read off the same Locker the client reads.

**It is a speed bump, not a lock**, and the code says so. Fights resolve on the client;
until each one is checkpointed server-side as it falls, a patient forger is paid at the
rate an honest run would be. The per-fight checkpoint is still the real fix.

## Connects to

- [raids-campaign.md](raids-campaign.md) — same combat engine, same laws.
- [crew.md](crew.md) — party lock, hardcore death. [forge.md](forge.md) — loot feeds it.

### The arena renders at 1.5x (2026-09-16)

`GauntletArena.tsx` capped `resolution` at 1.25, which on a 2x desktop monitor drew the water
at five eighths of native and upscaled it, visibly soft under the crisp DOM fight. It is 1.5
now. Not the chart's 2, on purpose: the file's own note records that the aim bar's compositor
animations are what a saturated GPU stutters, and the arena is scenery behind a fight. If the
fight stutters on a weak GPU after this, 1.25 is the number to go back to.

## The reward curve was shaped backwards (2026-09-18)

Kong, at depth 18: "I'm one shotting enemies so it's really quick to get here" — 24,000 ⟡
and 11,000 Nav XP off a run that risked nothing. The height was the symptom. The SHAPE was
the bug, and a flat percentage cut would not have fixed it.

**What was wrong.** This is a push-your-luck mode, so reward has to rise with the risk you
accept. It did the opposite. Both curves flattened early (pot at depth 20, Nav XP at 15), so
past those points every extra depth paid a CONSTANT amount, while every extra depth costs
steadily more time as hulls get tanky. The best ⟡/hour and XP/hour was therefore a fast
shallow loop, bailing at a depth you cannot die at, repeated forever (no cooldown). Pushing
deep was strictly worse per hour AND carried the only real risk: a sink banks Fathoms,
bounty progress and the deepest-died counter, and nothing else. On top of that the flat
per-round BASE (80 ⟡ / 80 XP) paid out fastest where rounds are quickest, and the cash-out
chest tier multiplied NAV XP as well as doubloons, stacking with the Locker's own 1.25× to
nearly 1.9× on the sharper of the two problems.

For scale, one depth-18 dive was about 26 full clears of a late-chapter raid in doubloons
and 10 in Nav XP — enough to take a fresh account to Nav 35 and buy a tier-6 rod outright.

**The fix.** The flat bases are gone (0), growth is cut (`POT_GROWTH` 50→34, `XP_GROWTH`
25→14), the flattens are pushed out past the depths people actually push to
(`POT_FLATTEN_DEPTH` 20→30, `XP_FLATTEN_DEPTH` 15→26), and `chest.potMult` no longer touches
Nav XP in `cashOutGauntlet` (a chest is the doubloon-and-gem reward; the Fathoms-bought
Locker upgrade still applies, that one is meant to be felt). Marginal ⟡ per non-boss depth
now RISES 340 → 680 → 986 across depths 10, 20 and 29 instead of going constant at 20.

| Depth | ⟡ before | ⟡ after | XP before | XP after |
|---|---|---|---|---|
| 10 | 6,084 | 3,223 | 3,523 | 1,040 |
| 18 | 21,945 | 12,801 | 11,270 | 3,232 |
| 30 | 51,030 | 35,139 | 22,326 | 8,600 |
| 40 | 76,950 | 59,619 | 31,539 | 13,514 |

Hardest exactly where the risk is lowest: depth 18 loses 71% of its XP, depth 40 loses 57%.
Retune GROWTH to move the height, FLATTEN to move the shape. `maxPotForDepth` (the server
ceiling) and `estimatePotForDepth` (the intro preview) derive from `roundContribution`, so
they followed automatically; a run already in flight just clamps down, which is safe.

**One duplicate formula had to be caught by hand.** `lib/gauntletContracts.ts` inlined a
copy of the pot formula for the Don's plunder reward, commented "kept as its own formula so
this module stays decoupled from the pot economy". Decoupled is exactly what it must not be:
its stated intent is "roughly a boss round's contribution at this depth", so the copy went
stale the moment the pot moved and a contract would have paid several rounds' worth. It
calls `roundContribution` now. See [[feedback-raid-damage-formula-duplicated]] for the same
trap in combat.
