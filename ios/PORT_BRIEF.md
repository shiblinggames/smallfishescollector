# Tide Run — Native iOS Port Brief

Mission: rebuild Tide Run as a **standalone native iOS game** (Swift + SpriteKit) for the
App Store. Free, no accounts, no IAP, fully offline. The web version stays live and
unchanged; this is an additive channel. The Xcode project lives in this folder
(`ios/TideRun/`), right next to the web source it ports.

This brief is the handoff from the Windows dev machine. The session reading this has the
whole repo — every pointer below is a real path. **The TypeScript source is the spec.**
When this document and the source disagree, the source wins.

---

## 1. What Tide Run is

A Canabalt-style one-touch endless runner. A small pirate boat auto-scrolls right along a
rolling sea surface. Press-and-hold to jump (longer hold = higher/longer jump). Distance
in meters is the score. One life, instant restart.

It is already a **canvas game with a custom RAF loop and custom physics** — not DOM. The
port is therefore mostly mechanical: same loop, same math, different renderer/language.

## 2. Source file map (read these first)

| File | What it is |
|---|---|
| `web/app/(app)/tavern/tide-run/TideRunGame.tsx` | THE GAME. ~2,280 lines. Constants block at top (lines ~11–137) is the complete tuning sheet. Custom physics in `step()`, spawning in `spawnHazard()`, all rendering in `render()` + the `draw*` helpers at the bottom. |
| `web/lib/tideRunAudio.ts` | Web Audio SFX layer (4 sounds + iOS-PWA session keeper). The session-keeper hacks are NOT needed natively. |
| `web/app/(app)/tavern/tide-run/actions.ts` | Server calls (leaderboard, doubloon payouts). All replaced natively — see §7. |
| `web/app/(app)/tavern/tide-run/TideRunTour.tsx` | First-run tutorial overlay. Port the *idea* (3 short cards), not the code. |
| `web/public/boatrun.png` | The ONLY image asset. Trimmed boat sprite, aspect 805:595. |
| `web/public/tiderun_beaconcatch.mp3`, `tiderun_beaconcrash.mp3`, `tiderun_splash.mp3`, `tiderun_crash.mp3` | The 4 SFX. Copy into the Xcode asset bundle (convert to .caf/.m4a if you like). |

Everything else on screen — sea, rocks, shoals, beacons, currents, islands, clouds, wake
foam, splashes, debris — is **drawn procedurally** (paths + gradients), not sprites.

## 3. Mechanics inventory (all must survive the port)

1. **Wave-riding boat** — boat sits on a multi-sine sea surface (`seaSurfaceY()`):
   primary + secondary sine, long-period "flatness" modulator alternating calm/rolling
   stretches, amplitude ramps up over the first 8,000 world px.
2. **Press-and-hold jump** — impulse on press (590 px/s), reduced gravity (0.30×) while
   held up to 0.40s, full gravity (2,800 px/s²) after release. No auto-launch off crests.
3. **Rocks (hazards)** — 3 size tiers with distance-gated unlocks (small-only < 25m,
   no-large < 90m). Jump over them. Spacing has **time-based reaction floors** so high
   speed never outpaces a human (≥ 0.55s between hazards, +0.10s before medium,
   +0.30s before large).
4. **Beacons (signature mechanic)** — disguised detection devices that *look like rocks*
   (faint rust, thin antenna, pulsing amber light). **Smash through them grounded** to
   stay hidden; jumping over one triggers detection: gameplay freezes ~0.55s, a light
   beam fires upward, then wreck. Tricks the "see rock → jump" reflex. Smashing grounded
   = debris burst + amber ring + 200ms shake + 55ms hitstop. 22% of spawns past 75m.
5. **Shoals** — deadly horizontal zones on the surface; die if grounded inside. Width
   auto-scales vs current speed so an un-clearable shoal can never spawn (≤ 70% of
   full-hold jump distance).
6. **Shoal clusters** — 2–3 shoals with narrow safe strips (165–235 px) between them:
   the precision-landing mechanic. Only past 140m.
7. **Currents** — slow zones (0.55× scroll when grounded inside; smooth enter/exit
   rates). Ride through for more reaction time, or jump them to keep speed. A shoal
   within the ~1.6s recovery window of a current is forced narrow (fairness rule).
8. **Speed ramp** — 290 px/s base, +5 px/s², soft cap 1,500. The ramp number has history:
   was 7, eased to 5 on 2026-05-19 because the global hiscore plateaued. Don't "fix" it.
9. **Day/night palette cycle** — midday → dusk → night → dawn over 2,400m, continuous
   lerp between 4 palette stops (`PALETTE_STOPS`, lines ~209–222). Port the exact hexes.
10. **Juice** — bow wake foam particles, landing splashes, beacon debris + smash ring,
    near-miss FX on rocks (one-shot per rock), micro-hitstop, brief screen shake.
    All subtle and localized (see §8).
11. **Scoring** — meters = world px / 60 (`METERS_PER_PIXEL = 1/60`). Live HUD shows
    integer meters; settled numbers (wreck screen, PB) show 1 decimal.
12. **Wreck screen** — distance result, PB, beacons smashed, restart. Web version shows
    leaderboard rank + gap-to-next-rank as the motivator; native should recreate that
    pull with Game Center (see §7).
13. **First-run tour** — 3 short instruction cards before the first run.

## 4. Tuning constants — port VERBATIM

The constants block at the top of `TideRunGame.tsx` (lines ~11–137) is the canonical,
hard-won tuning sheet — every value has a comment explaining itself, several have dated
tuning notes. **Transcribe it 1:1 into a `Tuning.swift`**, keeping the comments. Do not
round, "clean up", or re-derive anything. The feel IS these numbers.

Same for `PALETTE_STOPS`, `seaSurfaceY()`, and `HITBOX_INSET`
(top 0.35 / right 0.12 / bottom 0.08 / left 0.08 on the trimmed sprite).

Ship sizing gotcha: ship height = 9.5% of canvas height, but clamped against a
mobile-reference height of 620 (`SHIP_SIZING_REF_H`) so big screens don't get a giant
boat. On iPhone-only this matters less, but keep the clamp for iPad.

## 5. Architecture for the Swift build

- **SpriteKit `SKScene`** with `update(_:)` as the loop. Compute real dt from the
  timestamp delta and **clamp dt** (web clamps via RAF; a backgrounded app's first
  frame back must not teleport the boat).
- **Do NOT use SpriteKit physics.** The web game's physics is ~30 lines of bespoke
  integration (gravity, hold-multiplier, surface snap). Port that math verbatim —
  SKPhysicsBody would change the feel and adds nothing.
- **Coordinate flip**: canvas is y-down, SpriteKit is y-up. Recommend keeping all game
  math in the web's y-down "surface space" and flipping only at node-position time, so
  ported formulas stay literally identical and diffable against the TS.
- Rendering the procedural art: sea surface = `SKShapeNode` path rebuilt per frame (or
  an SKShader if perf demands); rocks/beacons/shoals = textures generated once per
  spawn size (draw the same paths into `SKTexture`s) on `SKSpriteNode`s; particles =
  a pooled set of tiny sprite nodes (skip `SKEmitterNode` for wake/debris — the web
  particles are world-anchored with custom motion; port their update math).
- **Input**: `touchesBegan` = press (jump start), `touchesEnded` = release. Whole
  screen is the button. Also handle `touchesCancelled` as release.
- **Audio**: `AVAudioEngine` or `SKAction.playSoundFileNamed` for the 4 SFX. All of
  `tideRunAudio.ts`'s silent-loop session-keeper machinery exists only because of iOS
  Safari PWA limits — **delete the concept**, native audio needs none of it. Respect
  the mute toggle; persist it in `UserDefaults`.
- **Haptics — the native dividend**: `CoreHaptics`/`UIImpactFeedbackGenerator`.
  Beacon smash = medium impact (sync with the hitstop), wreck = heavy, landing from a
  big jump = light. Subtle; nothing continuous.
- **State**: `UserDefaults` for PB, mute, has-seen-tour, lifetime beacons smashed.
- **Game Center**: one leaderboard (best distance, 1-decimal as score×10), a handful of
  achievements (first beacon smashed, 100m/250m/500m, smash 50 beacons lifetime).
  Recreates the wreck-screen "gap to next rank" pull the web version gets from Supabase.
- **Menus/overlays** (ready screen, wreck screen, tour cards): SwiftUI layered over the
  `SKView` is fine, or in-scene nodes — implementer's choice, but keep the wreck screen
  fast: dead → result on screen in well under a second, restart is one tap.
- 120Hz: don't lock to 60; physics is already dt-based.

## 6. Things the web version does that the port must keep exactly

- **Lookahead spawning**: `spawnHazard()` runs in a while-loop filling the world ahead
  of the viewport; cleanup sweeps only behind it. (Repo memory note: any filter inside
  that loop must gate by viewport or visible obstacles vanish mid-frame — same trap
  exists in any port.)
- **Fairness rules**: reaction-time floors (§3.3), speed-scaled shoal widths, the
  forced-narrow shoal after a current, beacon/shoal minimum time-from-previous-rock so
  the player can always be grounded/airborne as required.
- **Beacon detection sequence**: freeze → beam → wreck. It's a pause + animation, not an
  instant death; that beat teaches the mechanic.
- **One-shot near-miss FX** per rock (the `nm` flag) — fires once, never spams.

## 7. Web features to DROP or replace

| Web | Native |
|---|---|
| `submitTideRunBest` / `getPlayerTideRunRank` / `getTopTideRunHolder` (Supabase) | Game Center leaderboard + local PB in UserDefaults |
| `awardTideRunBeacons` (2 doubloons/beacon into the shared game economy) | No currency. Count beacons per-run + lifetime; feed achievements. (If cross-game doubloon sync is ever wanted, that's a later, accounts-shaped problem — explicitly out of scope for v1.) |
| `recordTideRunRun` stats RPC | Lifetime counters in UserDefaults |
| `LeaderboardModal`, React/framer-motion overlays | SwiftUI / in-scene equivalents |
| `tideRunAudio.ts` session keeper, audio-unlock gesture dance | Delete — not needed natively |
| `has_seen_X` DB tour flag | UserDefaults bool |

## 8. House rules that still apply (from the game's design canon)

- **Juice subtlety**: effects are subtle and localized. No screen-wide flash, no heavy
  constant shake. The existing shake (200ms, small amplitude) and hitstop (55ms) are the
  calibrated ceiling — match, don't exceed.
- **Copy voice**: in-game prose has NO em-dashes, must not read AI-generated; pirate
  charm, clear button titles, no redundant subtext. Reuse the web version's strings
  wherever they exist (wreck screen, tour cards).
- **Sea-creature vocab**: characters are sea creatures. Never "men/man/humans" —
  "ships/crews/captains/sailors".
- Name/branding: "Tide Run" (working title; App Store name TBD with the user).
  Bundle id suggestion: `com.shiblinggames.tiderun`.

## 9. Kickoff order for the Mac session

1. Read `TideRunGame.tsx` top to bottom (it is the spec), then this brief again.
2. Scaffold: Xcode iOS App project at `ios/TideRun/` — SpriteKit GameScene + SwiftUI
   shell, portrait... **no: landscape-or-portrait question is settled — the web game is
   portrait-friendly fullscreen; ship portrait first, it's a thumb game.**
3. Port `Tuning.swift` (constants + palette stops + seaSurfaceY + hitbox insets) verbatim.
4. Boat on the wave: render loop, sea surface, ship sprite riding it, jump physics.
   Get THIS on a device via personal-team signing before going further — the hold-jump
   feel is the foundation everything else tunes against.
5. Spawning + collision: rocks → shoals → clusters → currents → beacons (in that order;
   it mirrors the in-game unlock ladder).
6. Juice + audio + haptics: wake, splashes, debris, ring, hitstop, shake, the 4 SFX.
7. Day/night palette, distant islands + clouds parallax.
8. Ready/wreck/tour screens, PB persistence, mute toggle.
9. Game Center, app icon, launch screen, TestFlight.

Step 4 is the milestone that matters: if the boat-on-wave + hold-jump doesn't feel like
the web game side-by-side on the same phone, stop and fix before building anything else.

---

# UPDATE — 2026-08-10

The brief above is still broadly right about the game loop, but the game has
grown since it was written and one section of it is now wrong. Read this before
starting.

## The decision, settled

**Native Swift + SpriteKit, iOS only, and its own leaderboard via Game Center.**
Nothing about the standalone touches Small Fishes: no account, no Supabase, no
doubloons, no shared board. That is a deliberate simplification rather than a
limitation — see "What NOT to port".

## The source is still the spec, and here is what changed

`web/app/(app)/tavern/tide-run/TideRunGame.tsx` remains THE reference. Constants
verified against it on 2026-08-10:

| | |
|---|---|
| `GRAVITY` | 2800 px/s² |
| `JUMP_IMPULSE` | 590 px/s |
| `JUMP_HOLD_GRAVITY_MULT` | 0.30 |
| `JUMP_MAX_HOLD_SEC` | 0.40 |
| `BASE_SPEED` / `SPEED_RAMP` / `MAX_SPEED` | 290 / 5 / 1500 |
| `SEA_BASE_Y_PCT` | 0.60 |
| `HAZARD_SPAWN_SPACING` | 360 world px |
| `SHIP_HEIGHT_PCT` / `SHIP_SIZING_REF_H` / `SHIP_ASPECT` | 0.095 / 620 / 805:595 |
| `CYCLE_DISTANCE_M` | 2400 (a full day/night cycle) |

**Beacons now start at 66m, not 75m.** `BEACON_CHANCE` 0.22, no two in a row,
and a `BEACON_AFTER_ROCK_TIME_SEC` 1.05 landing buffer scaled by current speed —
a TIME floor, not a distance, which is what keeps them fair as the run speeds up.

## New since the brief: cosmetics, and they are most of the remaining work

Two unlock ladders, both keyed on best distance and both interleaved so
something is always close. Catalogs are plain data and port directly:

- `web/lib/tideRunBoats.ts` — 12 boats. Art in `web/public/tiderun/`, eleven
  320x237 transparent PNGs plus `boatrun.png` as the starter. Thresholds
  0/75/150/225/300/375/450/525/600/700/800/900.
- `web/lib/tideRunSeas.ts` — 6 seas. NO ART: a sea is four palette stops of
  eight colours which the renderer already draws every sky, sea, island, cloud
  and foam pixel from. Thresholds 0/125/250/400/550/750.

Two rules the port must keep:

1. **The art never drives the hitbox.** Every boat shares the original's 1.353
   aspect precisely so `SHIP_ASPECT` and the `HITBOX_INSET` box are identical
   whichever is equipped. A cosmetic that changes your hitbox is not a cosmetic.
2. **Hazards do not use the palette's `island` colour.** Rocks, shoals and
   beacons have their own hardcoded colours, so a sea can only ever restyle
   decoration (far ridge, distant isles, sea stacks). A new sea can never make
   a hazard invisible.

UI to rebuild: the locker (two tabs, locked entries shown silhouetted with their
distance, "Sailing" chip on the equipped one), the unlock overlay (dismissed by
TAP not a timer, equips on dismiss, seas queue behind boats), and the entry
points on the start and wreck screens.

## Persistence: `adapter.ts` is your spec

`web/app/(app)/tavern/tide-run/adapter.ts` defines the whole surface the game
needs from its host, and `localAdapter` in that file is exactly what the native
build should do — in UserDefaults instead of localStorage:

    bestDistance, boatId, seaId, hasSeenTour

Ownership is DERIVED from `bestDistance` against the thresholds, never stored as
a list. Keep that: it means retuning a threshold retunes who owns what, and
there is no granted list to drift out of step.

## What NOT to port

- **Doubloons and the beacon payout.** No economy standalone. This deletes the
  entire exploit surface with it: the clamp, the anomaly flags and the
  server-issued run token all exist only because beacons pay real currency.
- **Auth, Supabase, and everything in `actions.ts` / `serverAdapter.ts`.**
- **The shared leaderboard, `LeaderboardModal` and `PodiumToast`.** Game Center
  replaces all three.

## One thing to get right that the web version does not

Distance is client-authored on the web and only partly guarded. Standalone that
matters more, because the leaderboard IS the game: submit to Game Center from
as close to the run's own state as possible, and treat an impossible score the
way the web build treats an impossible beacon count.
