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
  every hit-test. It also means **there is no geometric horizon**.
- **There is no sky.** A haze band with a cloud parallax was built and removed: on a plane
  that never converges it read as weather rolling over the water rather than distance, and
  no amount of tuning the dissolve fixed what the projection was saying. The chart is looked
  at from above; it does not need a horizon to be one.
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

## The shape of the chart

**The Mainland is the origin, and the fishing zones are concentric semicircular bands
fanning SOUTH from it.** The Harbour is the divide: expeditions live north of the Mainland,
everything to do with fishing lives south. Depth is simply how far out you have sailed.

| band | inner | outer | width | Fishing level |
|---|---|---|---|---|
| The Shallows | 1400 | 3800 | 2400 | 1 |
| Open Waters | 3800 | 6900 | 3100 | 15 |
| The Deep | 6900 | 10900 | 4000 | 30 |
| The Abyss | 10900 | 16000 | 5100 | 50 |
| The Ancient Deep | 16000 | 22600 | 6600 | 75 |

**Each band is ~29% wider than the one inside it.** They grew before too, but only from
2,000 to 3,200 across all five, which is not a progression anyone can feel. The Ancient Deep
is now nearly three times the Shallows. Crossing the Shallows is 5s at top speed; crossing
the Ancient Deep is 14s. Reaching it from the dock is 33s at top speed, 53s on a stock hull —
long, and deliberately: it needs Fishing 75, the hull refit exists to shorten it, and the
boat now starts where you left it, so the haul is paid once per destination rather than once
per session.


This replaced five discs scattered along an east-west line. With discs, "deeper" was a
direction you had to memorise, only the corridor the discs happened to lie on was fishable,
and the three deep zones sat in nearly the same bearing from anywhere — which is what made
the first compass unreadable. With rings, every southern heading is a valid way out, and
the answer to "where am I" is one number: `Math.hypot(x, y)`.

- `inBand(pos, place)` is the membership test: `y > 0 && inner <= R < outer`. Bands do not
  overlap, so the first match is the only match.
- **`LANDMARKS` and `RESIDENTS` are module-level lists in ABSOLUTE world coordinates.** They
  used to hang off each zone as offsets from its centre; a ring has no centre for an offset
  to be relative to.
- `seaAt()` blends the palettes by distance from each band's midline, with a fourth-power
  falloff, faded out over 700px north of the equator so there is no seam. **R is clamped at
  the outermost edge** — without that the falloff runs both ways and the water past the
  Ancient Deep brightens back toward ordinary blue, so sailing off the end of the chart
  looks like sailing into the shallows.

### The Mainland is the biggest thing on the chart

`r: 340`, against 210 for the Harbour and 200 for the Shipyard — 2.6× their area. Landed on
from both directions: 250 made it the same size as the two single-purpose ports and it read
as one stop of three; 440 filled the screen off the dock and read as a coastline rather than
somewhere you moor. It holds the tavern, the market and the tackle shop, and it is the origin every fishing
band is measured from; at 250 it was the same size as the two single-purpose ports and read
as one stop of three.

One number drives all of it: the island art (`place.r * 2`), the buildings (percentages of
that box), the shore the hull stops at (`r * SHORE + HULL` = 300) and the mooring ring
(`r + MOOR` = 760). `MAINLAND_DOORSTEP` in seaTraders derives from it too.

### The harbour approach

Ports are approachable from a **generous ring all the way around** — `moorR(p) = p.r + MOOR`
(420). It used to be the island's own radius, which was very nearly unusable: the hull stops
at `r * SHORE + HULL` (235 off the Mainland) and the go-ashore test was `r` (250). Fifteen
pixels of water on one heading is not a window.

**The Shallows start at 1400, well outside every moor ring**, so the hub and the first zone
never argue over which prompt you get: you are moored, or you are fishing, never both. That
gap is the harbour approach, and `HOME` sits in it at R=617 — close enough to go ashore from
a standing start, a short sail short of the water.

## The Shipyard (`/shipyard`)

Its own island on the chart, north-east of the Mainland, and **the successor to the fishing
page's Gear & Shop drawer**. Everything that drawer's Loadout and Stats tabs did happens
here, on a page, with the boat above it.

`GearScreen` is **mounted, not reimplemented**. It is 3,500 lines of pickers, buy flows,
gating and the forge bench, all of it already correct; a second copy would be two copies of
the fishing economy drifting apart. `ShipyardClient` holds the same set of `useState`s the
fishing page holds and calls the same server actions. When `/fishing` retires, nothing goes
with it.

Page order:

1. **The hero** — `FisherPose` at full width with glow ON, on a solid plate with a band of
   water under the hull. No title, no blurb, no pills naming the gear: the picture says all
   of that, and a page you sail to does not need to introduce itself.
2. **The rack, drawn on the boat** — one tile per berth, inside the hero card. Berth 0 is
   the rod in your hands and cannot be emptied; the rest open a picker. If a berth is still
   for sale the next tile IS the purchase, priced, and adds itself to the boat when tapped.
   These tiles are exactly what you can switch between at sea, which is why they live on the
   hull rather than in a list further down.
3. **`LoadoutStats`**, directly under the picture it is the sum of.
4. **Two tabs: Locker and Upgrades.** Locker is `GearScreen variant="locker"`; Upgrades
   holds the three `BoatCard`s (rack, hull, hold).

### `GearScreen variant`

`'drawer'` is the fishing page's bottom sheet: three tabs, because it is the only place any
of that lives on that screen. `'locker'` is the Shipyard's, and strips the tab strip, the
Shop tab, the Stats panel and the fisher preview — on that page each of them is a second
copy of something four inches higher up. The eleven remaining slots reflow from the wide
three-column grid (whose middle column existed to hold the fisher) into an even
`repeat(3, 1fr)`, with Badges spanning the odd column out.

Both grids are written out separately rather than one grid with conditional placement. The
drawer's explicit `gridColumn`/`gridRow` is load-bearing — `repeat(4, 1fr)` is what equalises
the card heights — and making it conditional would have meant one grid that is correct in
neither mode.

**The item sheet caps at 560px and centres with auto margins**, not `translateX`: it is a
`motion.div` and framer owns `transform` for the slide-in, so a transform there is silently
clobbered. Full-bleed on a desktop monitor put eight words on a line two feet wide.

### The collection log

`FishCollectionDrawer` is the fishing page's own drawer, **extracted, not copied** — zone
completion pays doubloons and spends a prestige, so two implementations would be two
implementations of a payout. `/fishing` mounts it too. It sits third on the tackle bar, after
bait and hold, and carries a dot when there are unlogged species rather than a count.

Both mounts hold the state and hand it down; the drawer owns only its drag-to-dismiss, which
is chrome on that element and was the wrong thing to make every caller build. A fresh catch
calls into the log immediately, or the drawer contradicts the result card still on screen.

Releasing an ancient is stubbed at sea: the drawer still shows the trophies, but letting one
go is the trophy wall's scene and happens ashore.

The extraction also gave one home to things that had been declared twice: `ZONES`,
`HABITAT_COLOR/LABEL/TAGLINE` and `FishSpeciesBasic` now live in `fishing/constants.ts`, and
`DrawerHandle`/`DrawerClose` in `components/DrawerChrome.tsx`.

### Buying an upgrade

**Every Shipyard purchase double-confirms.** They are permanent, four to six figures, and sit
under a finger next to the tile you meant to press. The modal says what the upgrade does,
what it explicitly does NOT do (the hull changes no fishing maths), now-versus-after side by
side, the price, and your balance. `EXPLAIN` and `DETAIL` are read by both the card and the
modal so the two cannot describe the same purchase differently.

**The type scale is seven custom properties** (`--sy-1`..`--sy-7`) on the page root, bumped
in one media query in globals.css. Every size on that page is an inline style and an inline
style cannot carry a media query; the phone layout was being served to a monitor unchanged.

### The rack, and the hull

- **Rods aboard** — `lib/shipyard.ts`. By default you carry ONE rod: the one in your hands.
  Berths cost 40k / 140k / 450k and cap at four, because past four you are carrying most of
  your collection again and the decision stops existing. At sea you can only swap to a rod
  you brought.
- **`HULL_SPEED` is a FRACTION OF TOP SPEED**, `[0.62, 0.74, 0.86, 1]`. It used to run
  1.0 → 1.6, which made `SeaMap`'s `SPEED` the *slow* speed — the chart is tuned so a fully
  refitted boat crosses it comfortably, and every player without the refit was sailing
  faster than that tuning assumed. Inverted, 470 px/s is what a Clipper Hull does and a
  stock hull makes 62% of it. Same spread, but the upgrade now buys back speed you can feel
  the absence of.

## The edges of the world

- **`NORTH_WALL = -1500`**, the Harbour's own latitude. The hull clamps at it and northward
  velocity is killed, so you slide along the line rather than stopping dead against an
  invisible pane. All three ports sit on or south of it and stay moorable.
- **No trader spawns north of it either.** `tradersAround` skips a cell whose SOUTH edge is
  at or above the wall, so a cell straddling the line still populates its fishable half.
  Verified: no surviving cell lies entirely north.
- Everything beyond is expeditions' business, and this screen has nothing up there — sailing
  into blank grey reads as a bug, not as a border.

## Where the boat starts

**`profiles.sea_x` / `sea_y`.** /sea used to drop you at `HOME` every time, which quietly
made the sail home optional: fill the hold in the Ancient Deep, tap the nav to the market,
sell at full price, and you reappear at the Mainland — exactly where the trip home would
have put you, for free. Leaving the page no longer moves the boat.

Written on `visibilitychange`, `pagehide` and on unmount (the unmount is the one that closes
the cheese — it is every in-app navigation), plus a 20s heartbeat for crashes and killed
tabs. The heartbeat skips a write when the boat has not moved 60px. Read ONCE into a ref, and
clamped to `NORTH_WALL` so a position saved before the wall existed cannot strand you.

Deliberately unvalidated: a forged position only moves your own boat, and there is nothing on
this chart reachable by starting somewhere that is not reachable by sailing there. The sell
lanes are guarded on their own terms.

## NPCs are found, not listed

The compass shows the buyer of the water you are in as a **circled `!`, never a name**.
Printing "Meg Corrin" on the horizon tells you who is out there, what they are and that there
is exactly one, before you have laid eyes on the boat — which is most of the discovery spent
on a label. The arrow says *somebody, that way, this far*; the rest you get by sailing over.

## Going ashore

Every port on the chart goes exactly one place, so tapping ashore is the whole decision —
except the **Mainland**, which holds the tavern, the market and the tackle shop. Dropping
you at `/tavern` and leaving the other two to the nav is not going ashore, it is being left
at a door. So it lands on a **three-card chooser** (`MainlandAshore`), the same shape the
Gauntlets card uses on the expeditions hub: cards on the backdrop, no container behind them.
The art is the building plates already standing on the island, so the card you tap is
visibly the building you sailed past.

`PopupShell` does **not** portal, so it is a DOM child of the map — and the map steers on
click and starts a heading on pointerdown. The chooser is wrapped in a
`stopPropagation` div or dismissing it also puts the helm over.

## The stack

`Z` in SeaMap, and it is written down because three screen-space overlays had **no z-index at
all** — which is not "on top", it is `auto`, and a positioned element with `auto` paints
*below* one with any positive value. The world layer is 1, so the action button, the water
banner and the compass were all painting underneath it: invisible the moment an island or a
landmark was in the same part of the screen.

`backdrop 0 · world 1 · compass 3 · ripples 4 · boat 5 · crossing 6 · hud 12 · action 13 · helm 14`

The rule: **anything the player can read or press belongs above the world.** The world is
scenery; the button that gets you into it is not.

## The backdrop, and the flicker

**One writer per property.** The rAF loop writes `sky.style.background` imperatively, so
React must not set `background` in that element's `style` prop — and the same goes for the
ripples' `transform`. This is the whole bug, and it took three attempts to see because the
first two read it as a cost problem:

1. Quantized `darkness` to 24 steps. Correct on its own terms, and it did fix the dusk
   strobe — but the blend also depends on where the boat is, which is continuous.
2. Snapped the boat's position to a 64px grid. **Made it worse**: a boat resting on a cell
   edge has its rounding flipped by float noise every frame, so the colour alternated rather
   than drifted.
3. The actual cause: `setTick` re-renders the map ~8×/sec to drive the proximity UI, and the
   JSX style prop carried a `background` computed at `HOME`. Every render stamped the wrong
   colour on, the loop's `!== lastCss` guard saw its own cached value unchanged and declined
   to put the right one back, and the screen alternated at 8Hz.

A re-render re-applies the entire inline style object, so any property the loop owns gets
silently reverted — and a "has it changed" guard in the loop turns that from a transient
glitch into a stuck one.

To check: grep the properties written as `.style.X =`, then grep those names inside each
`ref={...}` element's `style={{ … }}`. Zero overlap, or it is a bug. Currently zero.

The colour also lives on **its own empty layer** under everything (it used to be on the root
that contains the world, the tiles, the boat and every overlay, so each recolour invalidated
the lot), and the recompute is on a **deadband** measured from where the last look was taken
— once computed at P nothing changes until the boat is a full `SEA_STEP` from P, so there is
no boundary to sit on. `lum` is held between recomputes for the pale layer's opacity, which
is a composite rather than a repaint and wants every frame.

## The compass

**Its mount was deleted in an over-broad slice edit** and the component sat unreferenced for
a dozen commits. Nothing was wrong with the arrows; nothing was drawing them. If they are
missing again, check the mount before the maths.

Slots are assigned **by role, not won by distance**. Ranking by distance broke the instant
the zones became rings: from the Deep, the nearest edge of all five rings is a few thousand
pixels away and the Mainland is six thousand, so bands took every slot and the way home was
never shown.

1. **The nearest port, always.** The one heading you cannot afford to lose, and on a ring
   chart the least guessable — home is inward, and inward has no landmark.
2. **The buyer of the water you are in.** A band is thousands of pixels round and he is one
   moored boat on it; without an arrow he is findable only by luck.
3. **The next band out and the next band in**, aimed at their nearest EDGE. Neighbours only:
   the Ancient Deep is not a heading you follow from the Shallows, it is four crossings away.
   A band you are already in gets nothing.
4. **The other ports**, nearest first, with whatever room is left. Cap is four.

Anything already on screen is dropped — an arrow to something you can see is noise. Only the
two marks you ACT on (the port and the buyer) carry a distance readout.

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
