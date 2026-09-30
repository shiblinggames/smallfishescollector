# Seas the Booty, the Steam game (Godot)

The game rebuilt in Godot 4 for Steam (decided 2026-09-30; the why and every design
decision are in `docs/systems/steam-port.md`). Typed GDScript, Steam through GodotSteam.
Not to be confused with `../sea/`, the parked 3D sea prototype from August.

## Setting up a machine

1. Godot 4.7 (`winget install GodotEngine.GodotEngine`).
2. `node tools/setup.mjs` copies the content in from `web/content` and fetches GodotSteam
   (pinned version and checksum) into `addons/godotsteam`, which is not committed.
3. `node tools/parity.mjs` must pass before anything is committed.

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

## Layout

- `core/` the rules and their foundations (dice, clock, JSON, save file)
- `content/` copies of `web/content` files (committed; kept in step by `tools/setup.mjs`)
- `tests/` the parity runner and its cases
- `tools/` setup and the end-to-end parity run
