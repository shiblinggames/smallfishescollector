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
  recolours under the boat. Deeper is darker, colder, heavier. The bands are
  felt, not announced: their names ("The Shallows of the Dead" and so on) are
  never printed on a screen. Every title is the depth number. The name tables
  stay in `lib/gauntlet.ts` for the accents only.
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

**The hub is the inside of the maelstrom (2026-09-05, second pass).** The
first pass was a flat water plane with hoops and a spiral and read as a
placeholder. `GauntletSlipway` now HOSTS the sea's own maelstrom renderer
(`makeMaelstroms` from `sea/seaMaelstrom.ts`): the bowl container is the
camera it expects (scaled to hub size, squashed by GROUND, the eye held at the
centre of the view so the door is roused and its keeper's hologram lit), with
the arena's `gauntletScenery` under it. Moorings are a pool of light with
ripples; each carries a DOM card (icon, name, one-line blurb) that lifts as
she comes alongside; the eye gets a caption. Title block = door name, gauntlet
name, your deepest and the top descender; the rail is labelled; the helm is a
card.

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

`gauntletScenery.ts` is also what makes the water THAT gauntlet's: light
shafts from above (the silhouette bands that once drifted here were cut on
2026-09-07 as "black things moving across the screen"; do not re-add) (from BELOW in hardcore, red), motes
(wisps / gold dust / embers), a vignette that closes with depth, a pulse of
light in the deep, and at a boss depth an EYE that opens under the water and
watches the fight.

**The ships stand where the chart's ships stand.** `duelFrame()` in
`raidWaters.ts` is the chart's own construction of a broadside — DOCK stand-off,
FIGHT_CAM_LIFT, `zoomFor` × FIGHT_ZOOM, the GROUND squash — moved there so
SeaMap and the arena compose from one set of numbers. Your hull is anchored at
its centre and theirs at its waterline, as the chart reports them, because
RaidCombat lifts each side's overlays by what its anchor means.

**The keeper is solid inside his own door.** `makeMaelstroms` takes `{ solidKeeper }`, and
the Slipway passes it. On the chart Davy and the Don hang over their maelstroms as
projections, which is what a landmark across a junction should be: a signal, not a person.
Inside the gauntlet you are in the room with him, so `holoTexture` skips the luminance
flatten and the scanlines, the sprite drops to normal blend at full tint, and the flicker and
signal dropout go. Only the foot fade is kept either way, so he still stands IN the light
coming out of the hole rather than ending on a cut line.

**The way out is a place on the water.** There was no exit from the Slipway at all: you
arrived by sailing into a maelstrom and the only way back was the browser's own back button.
The Way Home takes the mooring the Ledger had (that page is on its way out), and sailing up
to it pushes `/sea`. The helm reads "Sail" there rather than "Moor". NOTE: the Ledger panel
is still reachable from the HUD rail, and it is the ONLY door to the gauntlet switcher
(`otherGauntletUnlocked`), so that has to move before the page can actually be deleted.

**A transition beat is a glimmer, not a burst.** `gauntletScenery.beat()` fires on every mood
change — boon, curse, shrine, merchant, contract, mark, chest, the win — which is twenty
times a dive, and it was throwing forty sparks and a ring that grew to 2.4x the short side at
0.5 alpha. Something that happens twenty times a run cannot be an event. The routine kinds
drop to twelve slower sparks, a ring that stays inside the arena, and a wash at 0.05; a
legendary pull and your own death keep theirs.

**A hit is wreckage; a miss is water.** `seaGunFx.impact()` threw the same soft round SPRAY
particle for both, in every direction, which is why a hull hit read as orbs floating off a
ship. A miss still throws its column, which is what a shot into the sea does. A hit gets a
short hot flash at the wound, a fan of SPLINTERS (their own texture, their own pool and
layer, since they fire on every hit and would otherwise recycle away the wreckage floating
off a ship that actually sank) thrown out and down with spin, and two puffs of powder smoke
a beat behind. Round is water, angular is wreckage: at that size the silhouette is the only
thing carrying the difference, so the two must never share a texture.

**Ice is built like the fire is.** The fire works because it is three layers doing three
different things: a heat pool at the waterline, tongues on their own prime-ish rhythms,
embers leaving. The ice was one layer of static shards with a diagonal band of light sweeping
over them on a loop, which is a shop-window shine rather than a material, plus twelve soft
round Pixi motes hanging around the hull. It is three layers now, all obeying the rule that
ice is STILL: rime creeping at the waterline, facets that GROW in on staggered delays and
then stop (growth is the one motion ice is allowed, because it is what ice does), and frost
dust falling off them. The Pixi condition motes for freeze fall too, at a third the size:
frost does not levitate.

**The two taps that decide a run hold long enough to be read.** `lockShot`'s judgment beat
runs 1050/760/560/480ms by result, up from 720/460/320/220. `claimBoon` splits the draft in
two: the haptic and the arena's answering beat fire on the click, the card holds lit and
stamped TAKEN for `BOON_CLAIM_MS` while the others dim, and `applyBoon` moves the phase after
that.

**The fight's furniture all hangs off ONE column.** `RAID_COL_MAX` (720) and `RAID_COL_PAD`
(11.2) are exported from RaidCombat, and `raidColumn()` turns them into the column's left and
right edges at the current width. Four things share it: the deck panel, the enemy's card
(docked to the LEFT edge, not 12px off the window), your own card (docked to the RIGHT edge,
which was still using the deck's old 580 cap and so sat seventy pixels inside the panel it
stands on), and the gauntlet's DepthBar, which spanned the whole display. On a desktop those
were four things that nearly lined up. The deck's bottom padding is `clamp(0.7rem, 5vh,
3.5rem)` too, because 0.7rem was measured on a phone and glued the log to the foot of a tall
window with the fight floating a long way above it.

**The boon draft is two layouts, not one scaled.** On a phone each card is a ROW (medallion,
name, payoff) because three tall cards would not fit on one screen and a draft you have to
scroll is a draft you cannot compare. On a desktop (`wide`) it is a real CARD: art at 128,
the rarity NAMED, the tier, the payoff, `b.detail`, and `b.flavor`. Three squat pills across
the top of a 1400px display with everything below it empty, asking you to commit off one
line while the explanation sat behind an info button, was the shape being fixed. The button
stays on both, because the rung ladder is the one thing the sheet still holds that the wide
card does not. Cards are `height: 100%` in the grid and the synergy chips take `marginTop:
auto`, so three descriptions of different lengths still square off as a row.

**The swap between screens, and the two effects it replaced.** Read this
before touching it, because the obvious ideas here have all been tried and all
failed the same way.

1. A tide sweeping up the viewport. Nauseating.
2. A still veil dipping the whole screen to near-black. A fade to black on
   every menu, twenty times a dive.
3. The same veil, shallower, tinted, keeping the water faintly visible under
   it. Still tiring to watch over and over.

The fault in all three is that they are FULL-VIEWPORT. Repeated thirty times a
run, an effect that changes the brightness of the whole screen makes the eye
re-adapt every time, however pretty the effect is.

So nothing full-screen happens now. The sea does not dip, flash or move: it is
the one continuous thing in a run and it is genuinely continuous. What changes
is the panel of words in front of it. `setPhase` calls `playSwap(commit)`,
which ramps the `Screen` layer's opacity to 0 over 200ms, commits the phase
(and `window.scrollTo(0, 0)`) while it cannot be seen, and ramps it back over
300ms. Rules:

- **Opacity only, never a transform or a filter.** That element is an ancestor
  of every modal and dock in a screen, and a transform on it breaks their fixed
  positioning.
- **The layer is never keyed and never wrapped in `AnimatePresence`.** It stays
  mounted for the whole run and only its children swap; a remount mid-ramp is
  the stutter this replaces.
- **One ramp at a time.** `fill: 'forwards'` animations pile up otherwise, one
  per screen; `ramp()` cancels the previous only after starting the next, so
  the held opacity is never released for a frame.
- The incoming ramp waits two frames after the commit, so the new screen has
  laid out and painted at zero before it starts coming up.

**What belongs to the fight ends with the fight.** Three things leaked out of
combat into the screens after it, all for the same reason: `fight` is
deliberately never cleared between depths (every screen after the first fight
reads its depth and its enemy off it), so anything derived from it stayed true.

- `bossHere` in GauntletGame's `arena()` is `fight.isBoss && (mood 'fight' or
  'dead')`. The maw overhead, the eye under the hulls and the boss's extra
  `heavy` used to persist through the reward, the breather and the whole next
  descent, which made the boss's own water the ordinary water.
- The arena clears `pose` (the fight's `shipFx` channel) whenever the mood is
  not `fight`. It holds the last combat frame's list, ward and condition, so a
  hull that ended a fight burning or frozen kept its ring on screens the ships
  are not even meant to be on.
- The bolt is far-off weather, not a strobe: roughly one every ten seconds at
  depth, a flash under 0.12 alpha, nothing at all above `heavy` 0.3. The first
  cut struck every second or two and washed the viewport at a quarter opacity.

**The hull is on the water only in a fight or a sinking.** `showHull` in
GauntletArena is `mood === 'fight' || mood === 'dead'`. The descent screen is
the sea swallowing a depth number and the breather is a log and a dock; a hull
parked in the middle of either read as a picture of a ship rather than a ship.

**Why the arena did not persist, and the water was a photograph (fixed 2026-09-07).**
GauntletGame's root wrapped every non-fight phase in an `AnimatePresence` keyed on the phase
and hoisted an `AbyssBackdrop` (fixed, zIndex 0) over it. Every phase change therefore
unmounted the whole subtree, keyed arena included (a WebGL Application per screen), and the
abyss covered the arena on every non-fight screen. Run phases now render the phase view
directly, so the keyed arena and `Screen` genuinely persist, and the abyss and scrim are kept
only for the hold, the used-up notice and the resume. `GauntletReward` draws no backdrop of
its own. If the water ever reads as a picture again, look for a fixed backdrop or a keyed
wrapper ABOVE the phase view before touching the arena.

**The screens between fights are HUD around the sea, not menus.** The breather
lost its bordered bank card and cells (numbers on the water, text-shadowed). An
open-water gap was added between the chest and the hull to show the ship, then
removed the same day once the hull stopped being drawn on that screen: an empty
spacer is just distance. The hull is drawn only in the fall, the fight and the
death. Second pass (2026-09-07): the two gradient choice cards were
replaced by `DockBtn`, the fight's own control (a 74px circle with a mark, the word under
it, the number under the word): Claim & leave / Dive deeper / Pause in one row, the dive
breathing. The chest odds lost their tiles, the hull is a 6px line, the loadout is a line of
type with a chevron, the sounding line is a caption. User's words: the old buttons "look like
AI-generated buttons". Rule: no gradient cards with an icon, headline, number and strapline
stacked inside; controls are circles-and-words, information is type on the water. Apply the
same to any in-run screen that reads as a stack of boxes.

Third pass (2026-09-07), the hierarchy: the run clock, the line of voice, the ledger eyebrow
and its labelled cells, the chest eyebrow/names/struck-through odds, the sounding eyebrow and
tail, and the "rides with you" line were all cut. The screen now reads top to bottom: the depth;
ONE big pot number with XP, fathoms and gems in a quiet line under it; the chest as icons and
odds; the hull; the loadout line; the sounding line as one line; the dock. Rule: a gauntlet
screen shows the stake, the risk and the choice, and everything else is one quiet line or
nothing.

**REJECTED, do not re-propose:** a sweeping wall of water up the viewport as
the transition, and an arena lurch (surge) on phase change. Both shipped
2026-09-05 and were pulled the same day: "terrible, distracting and
nauseating". Nothing full-screen may MOVE on a screen change; the light may
dip.

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

## Desktop-first

Full-canvas worlds are the model; phone columns are legacy. In the gauntlet:

- **The hub** composes from the viewport centre in units of the SHORT side
  (`SlipwayPlace.ox/oy`, `REACH_U`, the bowl's `z` clamp, hull size, speed,
  ripples). The DOM cards use the same stage in CSS:
  `calc(50% + ox * min(100vw, 100vh))`. A phone and a desktop see the same
  diorama; a wide screen's margins go to the water.
- **The fights** compose from the chart's `duelFrame()`, whose zoom is the
  chart's own `zoomFor(width)` (capped 0.82 on wide screens) times the
  push-in, so the duel is the size the sea's duel is. `RaidCombat`'s root
  column runs to 720px (was 580); phones are bounded by 100% before that.
- **The screens between fights** read one breakpoint, `useWide()` (900px):
  the sheet is 640 wide instead of 440, the boon draft lies three across, the
  Ledger widens to 720. `GauntletReward` reads the hook itself because it is
  its own component.

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

## The lobby is one tap, and a phone gets its own (2026-09-18)

Kong: "all the different options - run upgrades, perm upgrades. You should be able to just
click it once and have it open... their positioning on mobile is really bad."

**One tap.** Pressing a mooring only SAILED the boat to it; you then had to find the helm
that appeared at the bottom and press that too. `openPlace(id)` now runs off the card's own
press, so the panel opens immediately and the boat sails over behind it. `moor()` is kept
for the captain who steers by dragging. The Records is the exception and always was:
`LeaderboardModal` owns its open state, so its tile is rendered AS that modal's trigger via
the new `triggerContent` / `triggerClassName` props (which also let the gauntlet drop that
component's trophy EMOJI).

**A phone gets a different lobby, not a squeezed one.** The diorama is desktop-first and
`useSlipSpreadX`'s 0.62 squeeze was the attempt to make it survive a phone. It does not:
five `position: fixed` cards at fractional offsets on a 390px screen land on top of each
other, none can shrink (every one is `white-space: nowrap`), and they sit in the middle of
the drag surface you steer with, so touches meant for a card take the helm instead. Under
`useIsPhone()` (same 560px query) the water draws only the eye, the maelstrom takes the
upper half at `min(82vw, 46vh)`, and the four places become ONE row of four tiles, each the
place's own painted art over its label, docked above the tab bar (`--tabbar-safe` + 14px) in
the thumb's half (2026-09-24: the two-by-two grid of small type read as crowded). Same
places, same handlers, one press each.

**Tapping him is now legible.** The glow alone read as mood lighting on a picture. Two
edge-free ripples go out from him on a loop (the shape a finger leaves, which means "tap"
and nothing else) and the caption became a filled chip with a finger glyph, because a
bordered pill is the register of a control and 0.58rem of letter-spaced text over moving
water is the register of a caption.

**The descent is a descent.** 620ms and a vignette was long enough to be a state change and
too short to be going somewhere. `DIVE_MS` is 1500 and it runs all the way to black, in two
layers on one clock so the eye is the last thing lit. The mode choice goes through the same
veil via `descendInto()`, which fires `begin()` immediately so the server round-trip happens
UNDER the fade rather than after it. Nothing travels across the screen; that rule stands.

`DiveVeil` is portaled to the body and mounted by BOTH the intro and descending phases,
because `begin()` flips the phase mid-fade and unmounts the lobby tree. `initial={false}` is
what stops the second mount flashing back to transparent.

## Endgame polish, round one (2026-09-24)

Kong: "this is our endgame content, I really want these to stand out." The three picked:

- **Bosses surface.** `GauntletArena`: when a boss hull is first wanted, `riseAt` holds her
  under ~0.55s (the eye opens first off the boss flag), then she grows up out of the water from
  her waterline over ~1.9s (`node.scale.y` 0.18 -> 1, eased), with a shock ring and five water
  columns along her length, and three more as she clears. GauntletGame's `BossArrival` names her
  (Depth N over the name, the chapter banners' type, gold / red in hardcore) as she clears, then
  fades. Non-boss hulls still ease in.
- **Records and milestones answer on the water.** `gauntletScenery` BeatKinds `record` (gold,
  loud, the shafts flare hardest of any beat) and `milestone` (silver, quieter). Fired 450ms into
  the descent: `record` with the existing Uncharted Water pill, `milestone` on every tenth depth
  that is not a record (its eyebrow reads "A Milestone").
- **The deep is on the enemy.** A glow built from the hull's own painting (`hullGlow`: blurred,
  filled white, cached per url) sits UNDER her node as a sibling so her paint filter cannot
  recolour it. Depth 10+: waterline soak tinted weed-green. 20+: teal drowned glow. 35+:
  ghost-fire (paler, flickering). Hardcore reds it. Elites glow violet (`enemyAura`) at any
  depth.

**Round two (same day).**
- **The sounding line.** `DepthBar` carries a hairline along its own bottom edge (no added
  height; anything that grows above the fight shoves the stage mid-turn): the current run of ten
  depths as ticks, the ones behind you lit, a bead where you are, red diamonds where you sank a
  boss (`runEventsRef` boss events), green diamonds at `DON_RISE_DEPTHS` you have PASSED (future rises were shown at first and gave him away; never mark anything ahead), a
  gold notch at your record. Bosses are ROLLED, so nothing ahead is marked but what is fixed.
- **The lanterns go out.** Hardcore death: the lost squad is `LanternsOut`, each hand lit warm with
  their name, then going dark one by one (`LANTERN_FIRST` 1.1s, `LANTERN_STEP` 0.7s): glow dies,
  face greys and settles; the "rest in your Crew Hall" line arrives after the last.
- **NOT DONE, on purpose: a foil sheen on legendary boons.** The boon card records that a sweeping
  sheen was rejected (a shop-window shine moving over the words of an irreversible choice).

**Round three: things on the water between fights (2026-09-24).** `ArenaStage` on GauntletArena:
a screen passes `{ url, anchor, arrive, tint }` and leaves an EMPTY BOX where its icon was
(`stageAnchorRef`); the arena draws the painted object into that box on the water (measured at
4Hz, not per frame), standing on the box's bottom edge, with the hull reflection and its own
breathing glow. The Drowned Shrine BREAKS THE SURFACE (`rise`: grows from its waterline, shock
ring, four water columns); the Fence's hulk DRAWS ALONGSIDE (`alongside`: in from the right with a
wake, eases to a stop). Leaving the screen settles it under. Art: public/gauntlet-shrine.webp and
gauntlet-merchant.webp (Kie, prompts/gauntlet-*.json). Screens, choices and run flow unchanged.
The haul keeps its own chest-opening sequence (it has real chest art and an open/close beat).

**Round four: each hub is its own place (phase 4, first half, 2026-09-24).** Every Slipway mooring
carries a painted LANDMARK (`SlipwayPlace.art`), a different set per gauntlet, standing on its
pool of light over a multiplied dark dish, bobbing slowly, a touch bigger for the one you are at;
the card still hangs below it. public/slip-{davy,don}-{run,shore,records,leave}.webp (Kie,
prompts/slip-*.json):
| place | Davy (drowned, teal, barnacle) | the Don (green, black lacquer, gold) |
|---|---|---|
| Run Upgrades | chained sea chest glowing teal | gambling table under a striped awning |
| Permanent Upgrades | capstan and anvil on a rock | gilded vault door on a dock |
| The Records | standing stone of tally marks | lectern with a great open ledger |
| The Way Home | channel buoy with a rope ladder | gilded mooring post and lamp |
Still plan: Terms at a gibbet and Contracts at a table are in-run screens, not hub places.

**Round five: the pick and the price (2026-09-24).** Kong: boon and curse screens should be more
satisfying. A BOON GOES HOME: `flyBoonHome` (module scope, imperative WAAPI on throwaway elements,
no React state) bursts a ring + sparks off the chosen card's medallion (`data-boon-medal`) in its
rarity colour, flies a copy of its painting with a three-ghost trail along an arc into the Synergy
Codex link (`data-boon-codex`, which no longer fades on a pick so it can catch it), and the link
pops and bursts on arrival with a tick. The two passed cards SINK as they dim (y 14).
`BOON_CLAIM_MS` 820 -> 1150 so the landing is seen. A CURSE IS BOUND: "Bear It" closes two
dotted crimson chains across the art, then it sinks darkening into a red stain as `applyCurse`'s
from-below beat fires at 980ms. `curseTaking` clears only once the phase has left 'curse'.

**Round six: five boss entrances (2026-09-24).** Kong: the rise was great and every boss did it.
`BossArrival` in GauntletArena: `surface` (the rise), `fog` (small and pale from the far water,
growing into station, mist glow letting go), `maelstrom` (three shock rings on the spot, then she
rises turning), `ghost` (stutters into being inside a cold glow), `ram` (charges in from the
right with a wake, stops with a jolt and bow spray). Assigned BY HAND per boss in GauntletGame
`BOSS_ARRIVAL` (a hash put Davy's four on two styles), hash fallback for new bosses:
cartographer fog, krust ghost, pete surface, spet ram / admiral ram, don_finleone maelstrom,
quartermaster ghost, saltie surface. Each variant's four bosses are four different entrances.

**Round seven: Kong's pass on it (2026-09-24).**
- The hub's landmark IS the button: each mooring card is a box over the painting (0.21 x 0.23 of
  the short side, `translate(-50%, -92%)` written by the Slipway) with the name on a dark plate on
  the art and the sub line rising with `--k`; `.slip-tile` hover lights the foot glow and lifts
  the plate (globals.css).
- "Tap to descend" is no longer a gradient pill with a finger: a line of type ("Descend" with the
  double chevron) under the keeper's name.
- NO RING PULSE on routine beats (sinking -> the depth page, boons, curses, and the rest): the
  scenery's pulse opens only for legendary, record, milestone and death. `burstAt` lost its ring
  too, sparks only. Do not bring either back.
- Stage art is fitted to its box's HEIGHT as well as width (the tall shrine was cut off at the
  top); the shrine's box is 170 x 190.

**Round eight (2026-09-24).**
- Descend opens the Normal/Hardcore chooser ON THE PRESS; the dive to black plays once, after
  the choice (`descendInto`). It used to dive, surface to the hub for the chooser, and dive again.
- Ending a run leaves through `surfaceTo` (a dip to dark on a throwaway overlay, the swap in the
  dark, up again 650ms later once the hub has laid its water), and both end screens carry a
  `TopBack` pinned under the nav as well as the link at the foot.
- Hub landmarks are SMALLER (0.12 of the short side, was 0.2) and the NAME is the main thing: a
  larger plate just under the painting's foot, the whole box one button. The buoy no longer
  stands over Permanent Upgrades.

**The Codex, redone (2026-09-24).** Kong: the icon and the Codex looked outdated, and it was a
narrow modal on desktop. `SynergiesModal` is up to min(1000px, 96vw) wide, a header with the
painted tome (public/codex-tome.webp, Kie), tiles in an auto-fill grid (min 150px), each tile the
crest at 80px on a pool of its state's colour with a steady rim; the sweeping sheen on active
tiles is GONE (same rejected shine as the boon cards). The hub's Codex button and the boon
screen's codex link both use the tome.
Also: the maelstrom door landmarks were REMOVED on sight (Kong did not like them); the wreckage
circling in stays.

**The whirlpool reads 2.5D (2026-09-24).** Kong: the outer bands looked flat. `seaMaelstrom` deepened
its keystone (far edge 0.68 x 0.70, near edge 1.04 x 1.14, was 0.72 x 0.80 / 1.0 x 1.05), and the
skirt's crests and drag grow their near/far split with radius (`SKIRT_DROP` 0.30, `SKIRT_H` 0.78 at
the outermost ring, matching the mouth's keystone at the lip), so the south of the bowl reaches
well past the north. Each skirt ring sits in a holder that carries the squash while the sprite
inside turns; squash and spin on one sprite rotated the ellipse itself.

**What circles the bowl shrinks round the far side (2026-09-24).** The wreckage, spray, foam and
spirits draw at 0.74x their size on the north of their circle and 1.14x on the south (`depthK` in
`seaMaelstrom`, from the sine of each one's angle). This is local to the bowl, matching its
keystone; the chart-wide shrink-with-distance stays rejected.

**The pull takes hold, it does not snap shut (2026-09-24).** Kong: you got locked into the middle
suddenly, and on a phone she jittered once there. In SeaMap's loop the grip eases in over about a
second (`maelGripRef`), the strength rises on a smoothstep (was a power curve with an edge at the
grip line), and both the inward draw and the swirl fade across the inner 45% of the bowl, each step
capped to a quarter (in) / a fifth (round) of the distance left, so no frame can carry her past the
centre. The old fixed step overshot the eye and back every frame: that was the jitter. The lean
fades in the eye the same way.

