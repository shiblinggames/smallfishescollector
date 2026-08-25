# The Ocean Hub (`/sea`)

A painted 2D chart you sail across, with fishing, trade and NPCs on it. Admin-gated while
it finds its feet.

**Where this is going: the ocean hub REPLACES the fishing page.** Not a second surface, not
a shortcut — the intended end state is that `/fishing` is retired and everything happens
out here. Read that into every decision below: anything the fishing screen does that the
hub cannot is a gap to close, not a difference to live with.

Code: `web/app/(app)/sea/` — `SeaMap.tsx` (the chart), `FishingHere.tsx` (the cast loop),
`chart.ts` (every place), `TraderPanel.tsx`, `traderActions.ts`.
Shared: `web/lib/seaTraders.ts` (NPCs), `web/lib/seaClock.ts` (day/night).

---

## Why it is painted 2D and not an engine

A Godot build was prototyped and parked (`godot/sea/`). The house style is hand-painted,
and every plate the chart needs already exists in `/public` — an engine would have meant
approximating a look the repo already owns outright. The parked project's web export used
to live at `public/sea/`, which is now the chart's building art; the old `.gitignore` rule
for it silently swallowed the first five plates dropped in there.

## The projection

The world is one transformed layer. `transform: scale(zoom) scaleY(GROUND) translate(-cam)`.

- **`GROUND = 0.58`** — the plane is squashed vertically, so it reads as a surface you look
  ACROSS rather than down at. Zones become ellipses; north-south distances foreshorten.
- It is an **orthographic tilt, not perspective**. The plane never converges. That is
  deliberate: real perspective changes the scale under the boat as you sail, which breaks
  every hit-test for a cue atmospheric haze gives free. It also means **there is no
  geometric horizon** — the sky band is haze, and drawing a hard horizon line into it makes
  a curtain the world visibly slides under.
- **`zoomFor(width)`** pulls the camera back on small screens (~0.5 on a phone, 1.0 at
  desktop). The chart was drawn at desktop scale; unzoomed, a phone saw a sixth of one zone
  with the boat taking half the width.
- **Anything with height counter-squashes** by `1/GROUND` — islands, buildings, landmarks,
  traders, labels. A label was never on the plane at all.

**Everything that converts between screen and world must divide the zoom and GROUND back
out.** The tap handler, the wake, the ripples and the compass all do. Forgetting one is the
classic bug here.

## The boat

Pinned to the centre of the screen; only the world translates. Positions, velocity and
target live in refs, never state — this loop runs at 60fps.

- `HULL_BOTTOM = 119`, `HEAD_TOP = 8`, `WATERLINE_X/Y` — all **measured off
  `fishing_rest.png`**, not chosen. The 210px composite renders the 900×800 sheet 186.7px
  tall, and the sheet reserves its whole upper half for the rod and line, so the visible
  boat is nowhere near the middle of its box. Anything positioned against the BOX ends up
  ~100px from anything you can see. If that sheet is ever reframed, these are what need
  re-measuring.
- Acceleration is `1 - e^(-k·dt)`, not `min(1, k·dt)` — frame-rate independent, so a hitch
  is invisible rather than a lurch.

## Controls

- **A tap is a short hop** toward where you touched, distance capped (`TAP_HOP`).
- **A hold is a heading you keep** — press and stay pressed (220ms) or drag, and the boat
  runs the bearing under your thumb, re-aimed every frame from the thumb's SCREEN position
  (the finger is still, the sea moves under it). Release runs out gently.
- **Tap your own boat to stop.** Ports and traders are the exceptions: those course exactly,
  because for them the arrival is the point.

## Collision

`OBSTACLES` — ports at `r * SHORE` plus any landmark marked `solid`, each with half a beam
(`HULL`) baked in. Guarded twice: the helm cannot ORDER a course into rock, and the physics
step pushes the hull back out along the normal. Only the INWARD velocity is removed, so you
scrape along a coast and round it rather than stopping dead. Buoys are deliberately not
solid.

## Fishing out here

`FishingHere.tsx` calls the SAME two server actions as the fishing screen — `castLine` and
`reelIn` — so the maths is identical by construction. `reelIn` ignores the client's
`fishId`, `doubleCatch` and `jackpot` and rebinds them to its own `pending_cast` token.

**Server-owned, therefore free:** Phantom Hook, Perfected Sigil, Primeval Eye, rarity
bonus, wait multiplier, crate chance, jackpot, double catch, instant bite, Locked-In haul,
XP, size, PB, shiny, streak.

**Client-owned, therefore had to be built here:** needle speed (`FISH_DIFFICULTY_SPEED` ×
reel multiplier, rolled per bite), snag immunity (penalty → miss BEFORE sending), Second
Wind, the shiny sell/mount choice, the Galaxy wormhole, Auto Caster/Catcher, the Tide
Turner, `perfectXpMult`.

**Deliberately absent:** zone events, Ancient Deep boss mechanics, drift, the vigil.

Two traps worth keeping in mind:
- **A crate is not a fish.** `castLine` can return one; it must be reeled with `reelCrate`.
  Passing it to `reelIn` does not fail loudly — the token is already consumed, so the crate
  is destroyed silently.
- **The needle runs on the compositor** (WAAPI on its own layer), and the angle is DERIVED
  from the animation's clock. Never drive it with per-frame state. Start it from a callback
  ref, not an effect: `mode="wait"` means the node does not exist when the phase changes.

## Performance

The map **freezes entirely** while the dial is up — rAF returns immediately, CSS animations
pause, intervals stop. The dial is a reaction test at up to 650°/sec and every frame spent
moving water behind it is a frame the needle might not get.

Standing rules, each learned the hard way:
- **Never repaint a full-screen gradient per frame.** The backdrop and the sky are rebuilt
  only when their colour STRING changes, and `darkness` is quantised to 24 steps — the dusk
  ramp was otherwise ~7,800 full-viewport repaints per fade, which strobes.
- **The wash is two composited layers, not a canvas.** Filling it was 12× screen overdraw
  per frame; the pattern never changes, only where it sits, so it is transform-only.
- **NPCs use a 3-image composite, not `Skipper`.** Skipper mounts every frame of every layer
  and switches with `visibility` — correct for the player (the cast pose must swap
  atomically), 21 images each for a background boat.

## Art

`public/sea/` — buildings (tavern, market, tackle, harbour, lighthouse) and landmarks
(buoy, islet, wreck, rig, bones, monolith). Generated through the Kie pipeline documented
in the `nano-banana-2` skill, painted on **flat magenta** and chroma-keyed
(`m = min(r,b) - g`), because asking the model for a transparent background returns a
painted checkerboard. Style is matched against `public/crew/hall_*.png`.

**Nothing is drawn underneath a floating object.** Two attempts at a waterline — a dark
ellipse, then a pale one — both read as an object hovering over a surface. There is no
surface; the art is already cut off at its own waterline. Islands are the exception: they
are extruded solids and their offset contact shadow is correct.

Placement is **solved and asserted, never eyeballed** — buildings inside the coastline,
landmarks inside their zone and clear of each other, resident buyers reachable. Four of
five buyers were first placed inside solid landmarks, which would have made them literally
unreachable.
