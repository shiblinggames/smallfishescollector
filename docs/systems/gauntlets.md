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

## Connects to

- [raids-campaign.md](raids-campaign.md) — same combat engine, same laws.
- [crew.md](crew.md) — party lock, hardcore death. [forge.md](forge.md) — loot feeds it.
