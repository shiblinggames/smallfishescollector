# The Gauntlets become a place — plan

The facelift: each gauntlet stops being a stack of menus over a photograph and
becomes an instance you sail. Its own Pixi world, its fights fought on the
water the way the campaign's now are, and a descent that is visibly a descent.

Status: **Phases 0, 1 and 2 are LIVE.** Phase 3 (beats on the water) and phase 4
(the Don's dressing) are still plan. Read `gauntlets.md` first for the run
model, which this must not disturb.

---

## The three things asked for

1. The gauntlets get **their own Pixi instance**.
2. Entering puts you in a **dungeon sea**: a hub water with a place for each of
   today's menus, the Codex living in the HUD, and a **portal you sail into**
   to begin the run.
3. Fights happen on a **much more animated arena** that matches the gauntlet's
   own styling and reads as a final-boss zone.

---

## The one question that had to be answered first

**Is a second Pixi Application allowed?** Yes, here, and the reason is precise.

`components/DialFx.tsx` records that a second WebGL context once took the chart
down: a browser allows few live contexts and evicts the OLDEST, which was the
sea's, and nothing listens for `webglcontextlost`. That rule has always been
"one LIVE context", not "never a second Application".

`/raids/gauntlet` is its own route. `/sea` is unmounted while you are on it, so
its context is gone and the gauntlet's is the only one. This is the same
reasoning that made the raid route safe before the fight moved onto the chart.

**The rule this creates, and it is not optional.** The gauntlet's Application
must be created on mount of the gauntlet route and destroyed on unmount, and
the gauntlet must NEVER become an overlay on `/sea`. If it ever does, it takes
the chart's context with it. That sentence goes in the arena's own file, where
whoever tries it will be standing.

**A bonus that falls out of it:** inside the gauntlet we own the context, so
the aim bar there could be Pixi rather than the Canvas2D `AimBarFx` the sea
forced. Not phase one, but worth knowing.

---

## What is reused, which is nearly everything

The combat engine does not change. `RaidCombat` already has `overSea`, and that
mode is **renderer-agnostic by construction**: it stands down its own
backdrops, hides its own two ships, and takes

- `anchors` — a live handle giving each hull's screen position and width,
- `onShipFx` — the pose channel (recoil, shudder, list, sink),
- `onFightFx` — the event channel (fire, hit, crit, miss, dodge, sink, ability,
  volley, mega, summon).

Nothing in that contract knows it is talking to the sea chart. **An arena that
implements the same three things gets the whole fight for free**, including the
work from this month: the volley and mega vocabulary, crew ability motions,
legendary overtures, wards cut to the hull, the eight statuses, the summon
conjuring.

Reusable engine pieces, all already palette-independent or trivially so:

| piece | file | use in the arena |
|---|---|---|
| water shader | `sea/seaWater.ts` | the arena's sea, re-stopped per depth |
| projection + GROUND | `sea/islandArt.ts` | one plane, one squash, shared |
| gun FX | `sea/seaGunFx.ts` | guns, impacts, sink, volleys, megas |
| ability FX | `sea/seaAbilityFx.ts` | crew abilities, wards, statuses, summons |
| maelstrom | `sea/seaMaelstrom.ts` | the descent portal, and boss-depth weather |
| wake / splash / lights / clouds / squall | `sea/sea*.ts` | arena weather |
| hull sprites | `sea/seaCaptain.ts` | your ship; enemies from their own art |

**What is NOT reused:** `SeaIslandsGPU` itself. It is the chart's renderer,
coupled to bays, isles, traders, fog and a 45,000px world. The arena wants a
small enclosed water and none of that. The right move is a new, much smaller
renderer that imports the same *layers*, not a fork of the chart.

---

## The shape

### The Slipway — the hub water

A small enclosed sea, roughly 6,000px across, themed per gauntlet. Not a chart:
no fog, no traders, no bays. You arrive at its mouth and everything the gauntlet
offers is a place on it.

| today's menu | becomes |
|---|---|
| Locker / upgrades | a wreck you moor at |
| Merchant | a moored hulk with lanterns |
| Davy's Terms (hardcore) | a gibbet on a rock, only when hardcore is unlocked |
| Don's Contracts | a table under an awning on the Don's slipway |
| Records / Drowned Ledger | a monument of names |
| Codex | **the HUD**, as asked: always present, never a place |
| Start the run | **the portal**, a maelstrom you sail into |

The portal is the maelstrom layer already built for the junction doors, at
arena scale, with the same approach behaviour: it rouses as you close, and
sailing into the eye begins the descent.

**Naming.** `Slipway`, `Anchorhold` and `Deadlight` are all unused in the repo
(checked). Proposal: Davy's hub is **the Deadlight**, the Don's is **the
Anchorhold**. Both to be confirmed before anything is written down twice.

### The Descent — the arena

The run is a fall through depth bands, and the arena is one Pixi world that
re-themes as you go rather than a series of screens.

- **Each depth band restops the water and the sky**, exactly as the chart
  recolours under the boat. Deeper is darker, colder, heavier.
- **Weather carries the pressure**: squall, lightning, chop. Davy's Terms'
  Pressure dial already exists as a number; this gives it a face.
- **The `descending` phase becomes a real descent** — currently it is a
  transition; it should be the camera falling and the water changing around
  you, which is the cheapest possible "this got worse" signal.
- **Boss depths get their own arena**: the maelstrom overhead, the boss's
  hologram gone and the boss himself on the water, the fullest weather.

### The between-beats

Boons, curses, shrines, the merchant, mark choices and contracts are today
full-screen phases. Long term they should surface in the arena — a chest rising,
a shrine breaching, the merchant's hulk drawing alongside. That is phase 3, and
it is the one part that touches run flow, so it comes last and on its own.

---

## What must not move

From `gauntlets.md`, and every one of these is load-bearing:

- **Starting a run consumes the attempt.** Not finishing it. A prettier entry
  must not create a path that starts a run without spending it.
- **`gauntlet_run_open` stays true while paused.** Any "is a run in progress"
  check reads only that.
- **Crash recovery is checkpoint-based with server-owned resume.** The client
  never reconstructs a run. The arena is presentation; if it dies, the run is
  still on the server and resumes.
- **An open run locks the campaign party.**
- Per-depth bests, the bounded `gauntlet_depth_bests` table, and the
  variant/hardcore keying all stay exactly as they are.

**Therefore: `GauntletGame.tsx` keeps the brain.** It is 7,482 lines and it
holds the run state machine, the daily gate, the checkpointing and seventeen
phases. This plan does not rewrite it. It gets a new presentation layer that it
DRIVES, the same way `RaidCombat` drives the chart through three handles.

---

## Phases

Each phase is shippable and leaves the game better than it found it.

**Phase 0 — the arena, behind the existing menus.**
Build `GauntletArena`: a Pixi Application, one water, two hulls, anchors, and
the two FX channels. Mount it where the fight backdrop is today and give
`RaidCombat` `overSea`. Nothing else changes: the menus, the phases, the run
model are all untouched.
*Ships:* gauntlet fights immediately look like sea fights, with every effect
built this month.
*Risk:* low. One new file plus a mount. Reversible by not passing `overSea`.

**Phase 1 — the descent has depth.**
Per-band palettes, weather tied to pressure, a real `descending` transition,
boss-depth arenas.
*Ships:* the fight zone reads as a final-boss zone and gets worse as you fall.
*Risk:* low, entirely visual.

**Phase 2 — the Slipway. SHIPPED.**
`GauntletSlipway.tsx`. The intro phase is water now: your ship on it, the two
Locker shops and the Ledger as lit rings you moor at, and the descent turning
overhead as a vortex you sail into. The Codex is a HUD button, as asked.

The old card stack was **not rebuilt** — it moved behind a "Ledger" button and
still holds the ranks, the records, the rules and the descent cards, unchanged.
That is why this was cheap: the sea changed how you REACH a panel, never what
the panel is.

**How entry stayed safe.** The vortex calls `setModeChoiceOpen(true)`, which is
the same Normal/Hardcore chooser the cards opened, which calls the same
`begin()`. There is no second start path, so the attempt-consuming rule was
never in a position to change. Verified against production: sailing into the
eye opens the chooser, dismissing it returns you to the water, and nothing is
spent. The chooser fires once on entry and re-arms only after you sail back
out, because a door that keeps re-opening while you sit in it is not a door.

Three things the first pass got wrong on real water, all fixed: the HUD was
pinned to the viewport and landed on the page banner (it flows now), the rings
were unlabelled hoops, and the hull had no shadow so it read as flying.

**The descent is continuous (part of phase 1, finished after phase 2).**
The arena mounts at the top of the FALL, not at the first shot, and is the same
element by `key` in both the `descending` and `fighting` branches. React
reconciles a component's top-level children by position and key, so the same
Application survives the phase change: the water you drop through is the water
you land on, and the second WebGL context is created once per run instead of
once per depth. **Keep the arena first, and keyed, in both branches or it
reloads.** The enemy is held off the water while you are still dropping and
eases in as the fight opens.

**Phase 3 — the beats on the water. SHIPPED (presentation half).**
Every phase of a live run renders the SAME keyed arena as its first child:
`arena(mood)` in GauntletGame. Boons, curses, shrines, the merchant, contracts,
the Don falling, the death, the cash-out all happen on the water you were just
fighting on. The arena takes a `mood`; `gauntletScenery.ts` grades the light
for it (a curse is a darker room with the light gone, a boon the same room lit
up) and plays a ceremony on the mood change. In-screen moments call
`arenaRef.current.beat()` directly: a boon pick in its rarity's colour, a
synergy as a legendary in violet or ember, a curse from below.

`gauntletScenery.ts` is also what makes the water THAT gauntlet's: tiling
silhouette bands (wreck masts, kelp and a whale's ribs for Davy; pillars,
arches and a fallen crown for the Don; spires, bone and a buried skull for
hardcore), light shafts from above (from BELOW in hardcore, red), motes
(wisps / gold dust / embers), a vignette that closes with depth, a pulse of
light in the deep, and at a boss depth an EYE that opens under the water and
watches the fight.

**The ships stand where the chart's ships stand.** `duelFrame()` in
`raidWaters.ts` is the chart's own construction of a broadside — DOCK stand-off,
FIGHT_CAM_LIFT, `zoomFor` × FIGHT_ZOOM, the GROUND squash — moved there so
SeaMap and the arena compose from one set of numbers. Your hull is anchored at
its centre and theirs at its waterline, as the chart reports them, because
RaidCombat lifts each side's overlays by what its anchor means.

**The tide between screens.** Every in-run phase renders its content inside
ONE module-level `Screen` at the same position in its fragment (right after
the arena), so React keeps a single instance and the `AnimatePresence` inside
it survives the phase change: the outgoing screen fades, a wall of dark water
in the gauntlet's colour sweeps up the viewport and off the top, the incoming
screen rises under it, and the arena surges in step (the rise tears past, the
hulls dip). Opacity only on the wrapper: a transform there would break every
fixed overlay inside it. Keep `Screen` second (after the arena) in every
branch, or the exit has nothing to play on.

What is NOT done in phase 3 is the run-flow half: chests rising, shrines
breaching, the merchant's hulk drawing alongside as things you sail to. The
screens are still screens; they just have the world under them now.
The same `key` trick is how the rest of this gets done: every in-run phase that
should keep the world alive renders the SAME keyed arena as its first child.
Boons, shrines, the merchant and contracts then become things that happen on
water you are already floating on, rather than screens the water is replaced
by. That part is presentation. What makes this phase the risky one is only the
run-flow changes underneath it, so those stay separate.
Boons, shrines, merchant and contracts surface in the arena.
*Risk:* highest, because it touches run flow. Last, and on its own.

**Phase 4 — the Don's variant and hardcore dressing.**
The Anchorhold, Terms at the gibbet, Contracts at the table, the Drowned Ledger
as a monument.

---

## Performance, up front

This month's lessons apply from line one, not as a later pass:

- The arena's world container **is a render group**. A camera that moves a
  plain container walks every descendant.
- Any per-frame `visible =` write is a **structure rebuild** of its group. Keep
  churny sprites in small groups.
- Particle systems **cull by camera distance** before they advance.
- **No per-frame React.** Imperative writes, refs, one style write a frame.
- Profile it the way the sea was profiled: puppeteer against production, CDP
  CPU profile, aggregate by self time. The harness exists.

---

## Verification

- A run started from the portal consumes the attempt exactly once.
- Killing the tab mid-run and returning resumes from the server checkpoint,
  with the arena rebuilt from that state and never from local memory.
- Both variants, hardcore and not, reach a boss depth and cash out.
- `/sea` still has its context after a gauntlet visit and a return.
- Frames on a phone at a boss depth, measured, not assumed.
