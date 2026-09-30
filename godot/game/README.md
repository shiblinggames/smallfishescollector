# Seas the Booty, the Steam game (Godot)

The game rebuilt in Godot 4 for Steam (decided 2026-09-30; the why and every design
decision are in `docs/systems/steam-port.md`). Typed GDScript, Steam through GodotSteam.

## Setting up a machine

1. Godot 4.7 (`winget install GodotEngine.GodotEngine`).
2. `node tools/setup.mjs` copies the content in from `web/content` and fetches GodotSteam
   (pinned version and checksum) into `addons/godotsteam`, which is not committed.
3. `node tools/parity.mjs` must pass before anything is committed.
4. `node tools/play.mjs` plays it (`--editor` opens the editor; `--pair` opens two windows as
   two players, to sail a Charter over the local network). Saves go to
   `%APPDATA%/Seas the Booty/captains/` in the web's local save format, and Charters to
   `charters/` beside it.

## The rules come from the web

The TypeScript rules in `web/lib` are the SPEC. The port does not reinterpret them.

- `web/scripts/parity-export.mts` runs the real TS rules on seeded dice and a scripted clock
  and writes what happened to `tests/parity/*.json`: every call, its clock, arguments,
  result and how many rolls it used, and the save before and after.
- `tests/parity.gd` replays those cases here and fails on the first difference. A system is
  ported when its cases match. Systems not ported yet show as PENDING.
- When a rule changes on the web, re-run the export; the failures here say what to change.

## Porting rules (read before porting a system)

- **Numbers are JavaScript's.** Every number in the save and content is a float here, as it
  is a double in the TS. Do the maths in floats: `7 / 2` is `3.5` in the TS but `3` between
  two GDScript ints. Use `floor()` where the TS has `Math.floor`, and `int()` only where
  the TS truncates on purpose.
- **Rolls go through `Dice.next()`, in the same order as the TS.** One extra or missing roll
  shifts every roll after it. The parity cases record rolls per call, so a count mismatch
  points at the call that drifted.
- **Time comes from `Clock.now_ms()`**, never the system clock, in rules code.
- **The save is the TS save's dictionary**, same keys and shape (`core/save_file.gd`), written
  with `JsJson.stringify` so it stays byte-compatible with the web's local save.
- Content the port reads is listed in `tools/setup.mjs`; `--check` fails when a copy drifts
  from `web/content`.
- **Tables are exported, logic is ported.** `web/scripts/export-godot-rules.mts` writes the
  rules' tables (rods, bait, zones, holds, lines, pets, crates, the daily pools) to
  `content/rules.json`; where a rule is a pure function over a small domain its answers are
  exported as a lookup instead (the colors a level earns, catch XP). Small constants are
  ported inline, each naming its TS source.
- **JavaScript's behaviours live in `core/js.gd`**: `Math.round` (halves go up, even
  negative ones), `??`, truthiness, `toISOString`, number object keys (`Js.key`), and
  `Object.keys` order for id-keyed objects (`Js.ids`, ascending). Use them; do not re-derive.
- **A TS result's `undefined` key is left OUT of the Godot dictionary; a `null` stays in.**
  JSON drops the one and keeps the other, and the parity cases compare key sets.
- The cases can set things mid-session (`patchProfile`, `patchSave`), recorded as calls so
  both sides fish the same save.

## Layout

- `core/` the rules and their foundations: dice, clock, JSON, save file, `js.gd`, `rules.gd`
  (tables and small helpers), `fishing_rules.gd`, `fishing.gd` (cast, reel, crate),
  `captain_store.gd` (the save as the cores read and write it), `vigil.gd`, `daily.gd`,
  `crate_loot.gd`
- `game/` the playable game: `main.gd` (controls, captain), `sea.gd` (the chart: water, world,
  night, camera), `water.gdshader`, `boat.gd`, `fishing_hud.gd` (the loop and the card), `dial.gd`,
  `golden.gdshader`, `ui_theme.gd`, `chart.gd`, `sea_clock.gd`, `session.gd`, `captains.gd`
- `content/` copies of `web/content` files (committed; kept in step by `tools/setup.mjs`), and
  `rules.json` (written by the web's rules export)
- `art/` pictures and fonts copied from `web/public` by `tools/setup.mjs` (NOT committed)
- `tests/` the parity runner and its cases, and the smoke runs, each on scratch saves:
  `smoke_fishing.gd` (casts and the Ancient Deep through the real HUD), `smoke_docking.gd`
  (ashore, the Market, the Tackle Shop, a buyer), `smoke_charter.gd` (run twice at once,
  `-- --role=host --as=anna` then `-- --role=crew --as=ben`: a Charter over the local
  network); `shot.gd` takes a picture of a screen
- `tools/` setup and the end-to-end parity run
