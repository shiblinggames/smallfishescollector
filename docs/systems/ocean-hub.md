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
the Ancient Deep is 14s. Reaching it from the dock is 33s on a stock hull and 16s fully refitted — it needs Fishing 75, the hull refit exists to shorten it, and the
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
that box) and the shore the hull stops at (`r * SHORE + HULL`). The berth is placed by its
own override (see the berth section). `MAINLAND_DOORSTEP` in seaTraders derives from r too.

### The berth (docking zones)

**The dock prompt lives in a drawn circle of water off each port's south-east shore** —
`berthOf(p)` / `inBerth(at, p)` in chart.ts, painted by `PortBerth` in SeaMap: a dashed ring
with three beacon lights standing on it, the chart's one warm colour; ring and lamps flare
while you are inside. (The old per-island jetty + lantern are REMOVED — they read as a brown
log with a dot; the beacons are the harbour lights now.) Default centre is
(`x + 0.85r, y + 0.6r`), radius `BERTH_R = 260`; a `berth` override on the Place moves it
(the Mainland's is pulled south so the `HOME` start point sits inside it and a fresh session
opens with the prompt up).

This is the THIRD era of the test. The island's own radius left fifteen pixels of usable
water on one heading. The generous 360° ring (`r + 420`) fixed that and created two new
problems: the prompt changed under your thumb anywhere near an island, and two islands
needed 840px between their rings or both prompts came up — the single fact that spread the
harbour cluster apart. With berths, docking is deliberate (sail INTO the marked water; no
hint outside it, the buoys and lantern are the teacher) and islands pack as close as
sailing room allows — the cluster was tightened when the rings retired (Trawl Harbour
-3000 → -2050, Homestead 1900 → 1500, Tally House -1500 → -1150, Shipyard 900 → 700; the
fleet's moored smacks moved in lockstep). `scripts/check-finn` and `check-traders` gate any
further moves.

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
3. **`LoadoutStats`**, directly under the picture it is the sum of — and it carries the
   boat's **Sailing Speed** and **Agility** too, rather than a panel of their own. "What my
   rig adds up to" is one question, and the hull is part of the rig: it decides how long the
   trip out to the fish takes, which is as much a loadout stat as the catch zone. Speed is
   shown as hull tier × boat trim already multiplied, because what a player wants to know is
   how fast they actually go, not which two things it came from.
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
- **`HULL_SPEED` multiplies a base, and the base is a whole boat.** `[1, 1.12, 1.25, 1.4,
  1.56, 1.75]` — six tiers, stock at **100%**. It spent a while inverted (SPEED as the
  ceiling, stock at 62%) on the reasoning that the chart was tuned for a refitted boat; that
  was wrong for one plain reason, which is that a player opening the game should not be told
  their boat is at 62%. A stock hull is not a broken hull.
  **Costs are the fish hold's, lifted whole** — `[0, 2k, 8k, 20k, 50k, 100k]`, which is
  `FISH_HOLD_TIERS` 2 through 6. The two upgrades sit side by side on the same screen and come
  out of the same purse, so a captain who can afford the next hold should be able to afford
  the next hull. Stacks with the boat's own trim and grade.

| | stock (300) | top hull (525) |
|---|---|---|
| Dock → the Abyss | 34s | 20s |
| Dock → the Ancient Deep | 51s | 29s |
| Dock → the far edge | 73s | 42s |

**The ladder is pinned to a SPEED, not a round multiplier.** `SPEED` is 300 and the top tier
is ×1.75 = **525 px/s**, because 525 is the number the chart is tuned against; it ran to ×2
for a while, which is a tidier figure and forty pixels a second too much. Steps are evenly
geometric at ~12%, so every refit is worth the same fraction as the last rather than the
early ones being the only ones you feel.

The boat multiplies on top of the ceiling: a Chromium reaches 618 px/s, a Pistachio 462. The
525 is the hull's ladder, not an absolute cap.

**`SPEED` is 300**, and the number has moved enough to be worth writing down: 470 as a base
when the Shipyard shipped, then 470 as the *ceiling* with stock at 62% of it (291), then 470
as a base again when stock went back to reading 100% — which quietly handed every player a
1.61× speed-up nobody asked for, a stock hull suddenly doing what a refitted Clipper used to.
300 is close to the 291 that actually got played, so the feel is the one that was tuned
rather than the one that fell out of a label change.

## The cliffs, and the gate

The north wall used to be an invisible clamp: you sailed into nothing and stopped, which
reads as the edge of a *level* rather than the edge of a world. It is a headland now — a
sheer wall the full 45,200px width of the chart with **one** gap in it, and the Harbour built
at the foot of that gap. It always sat at exactly `(-900, NORTH_WALL)`, so it was already
standing where the gate belonged.

**Sailing into the arch is how you leave for expeditions.** The confirm meets you *under* it —
that is the whole reason the wall became cliffs. Leaving the fishing grounds should be
somewhere you sail to and a thing you feel yourself doing, not a button on a menu. Backing out
(**Come about**) noses you south and costs nothing.

`GATE_HALF = 430`, so the opening is 860px — about four boats wide, and **1.9% of the wall**.
Wide enough to sail into without lining up, narrow enough to read as a gap in something rather
than a missing section of it. `GATE_DEPTH = 300` is the throat: far enough in that you are
plainly under the arch when it asks. The exit uses 90px of hysteresis so the prompt cannot
flicker for a boat sitting on the line.

### It is an island edge, not a new material

The first version of this invented its own language — grey rock, sedimentary banding, two
hazy ranges, atmospheric perspective — none of which appears anywhere else on the chart. It
looked like a screenshot from another game pasted onto the top of ours, because that is
effectively what it was.

The islands already answer *"what does land look like here"*: a warm brown extrusion under a
top face of sand, scrub and grass, wood clumps on it, and a shoal where it meets the water. A
cliff is that same land seen where it stops. So the wall is built from **exactly** those
values — a `LAND` constant lifts the islands' gradients rather than approximating them, and a
check confirms no colour exists in the wall that is not also in `PlaceIsland`. **If the
islands are ever repainted, this has to be repainted with them.**

Construction, matching the islands' own layering:

- **Ground running north**, on the plane so it foreshortens like ground: grass inland, scrub
  before it, a pale sandy lip at the very edge.
- **Wood clumps set back from the lip**, because nothing grows on the edge of a cliff.
- **The face standing up** along the southern edge, counter-squashed like every solid, in the
  islands' extrusion gradient, with their grass-lip and wet-foot shadows.
- **The islands' own shoal and surf** at the base — same values, same `sea-surf` classes, so
  the water meets this the way it meets everything else.

The skyline gets two octaves of variation so it has headlands *and* small steps; a flat-topped
wall is a fence.

Light through the arch is **pale daylight, not a portal**. It is a gap in a headland, and what
is behind a headland is more sea.

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

### Leaving the Docks

Three separate things made the close feel broken, and only the first was the one being
looked at:

1. **The exit never played.** The dock's close handlers called `onDismiss()` on the tap and
   left `open` true, so the sheet sat fully open on a dark backdrop while Next tore the route
   down, then vanished mid-navigation. A dismiss here is a NAVIGATION, and a navigation takes
   longer than a fade — so the fade has to finish first, not race it. `AnimatePresence`'s
   `onExitComplete` is the seam: `setOpen(false)` starts the slide-down, and only when the
   element is genuinely gone does it leave.
2. **`/sea` was fetched cold.** `router.push` does not prefetch the way a `<Link>` does, so
   the first thing that happened on close was a cold route fetch — *after* the sheet had gone,
   which is exactly the wrong order and reads as a hang. Prefetched on mount instead.
3. **It pushed a second `/sea`** on top of the one still in history, remounting the chart from
   cold: re-reading the boat's position from the server, rebuilding every island. A visible
   reload of a screen the player never left. It goes `back()` now, guarded by a sessionStorage
   breadcrumb the chart writes in `enter()` — **not** `history.length`, which counts entries
   from other origins and would walk somebody out of the site on a deep link.

## Hotspots

`lib/seaHotspots.ts`. **Three patches of water at a time, one of each kind, each in a
different band, all moving every 10 minutes.** The chart is 22,600 pixels deep and once you
had picked a band every part of it was identical to every other — you sailed to a depth and
then stopped, because there was no reason to be anywhere in particular.

**Each kind has one colour; each of its three tiers has a different strength.**

| kind | colour | tier 1 | tier 2 | tier 3 |
|---|---|---|---|---|
| Shoal — faster bites | green | Scattered, **12%** | Running, **22%** | Boiling, **35%** |
| Trench — rarer fish | purple | Cold, legendary **×1.42** | Deep, **×2.05** | Black, **×2.84** |
| Flotsam — more crates | gold | Drifting, **×1.6** | Heavy, **×2.2** | Wreck Field, **×3** |

Tier weights are 60 / 28 / 12, so a tier 3 is about one patch in eight and **32% of windows
hold one somewhere** — rare enough to be worth breaking off for, common enough that a session
usually contains one. Measured over 4,000 windows: 59.2 / 28.7 / 12.1.

**Colour says WHAT, brightness says HOW MUCH.** A Black Trench and a Cold Trench are the same
purple; one of them is plainly worth crossing water for, and both read before any text does.
`TIER_GLOW` scales the fill alpha, the rim and the bloom's falloff together, and each tier
gets its own pulse — a tier 1 barely moves, a tier 3 breathes hard enough to catch the eye
from the far side of a band, which is the job of a thing that is only there for ten minutes.

### The tier 1s are the point

They are deliberately small. The first pass shipped what are now the **tier 3** numbers as
the *only* numbers, and at that strength a hotspot stops being a bonus and becomes the game —
three places worth fishing and 22,600 pixels of chart that are the wrong answer. The tier 3s
earn their size by being rare: a big effect you have to go and find, rather than a big effect
that is always somewhere.

### Verified, not eyeballed

- Every tier's **stated effect matches its measured effect** — the badge's number is computed
  from the same function the server rolls with. A test asserts it, and it is what caught the
  shoal silently carrying a rarity bonus its description never mentioned.
- Each buff touches **exactly one** roll, and strength **rises monotonically** with tier.
- Across 400 windows: always three patches, never a missing kind, never two in one band,
  never a patch straddling a band edge.

### Sized for a chart the server cannot see

`castLine(bait, zone, at)` takes the position and **re-derives** the hotspot from the clock
rather than being told which applies. A forged position can claim a patch it is not standing
in; it cannot invent one, choose its kind or tier, or move it. Even a tier 3 is worth less
than the effort of forging a position for, and none of them touch payouts.

## The Trawl Docks (`/trawl-docks`)

Its own island, west of the Mainland and north of the equator — on the fishing side of the
Harbour without sitting in fishable water (verified: its mooring ring touches no band, and no
port's ring does).

`TrawlIndicator` is **mounted, not reimplemented** — same call as GearScreen and the
collection drawer. It already owns the zone cards, the crew picker, the collect reveal and
the slot ladder, and a second copy of a payout is the one duplication this codebase cannot
afford. Two new props:

- **`variant='dock'`** — no floating badge, the sheet opens on arrival, and closing it routes
  back to `/sea`.
- **`canDeploy`** — true only here. Sending used to be available from any screen that showed
  the panel, which made a voyage into a menu you opened and left the chart with one fewer
  reason to sail anywhere. On `/fishing` a sendable zone now reads **"Send from the Docks"**.

**The day's orders live here too.** The fishing daily challenges have always been ticking
from the ocean hub — progress is written server-side inside `reelIn`, so every cast from the
chart has counted since the day it shipped — but there was nowhere out here to SEE them, and
a goal you cannot see is not a goal, it is a coincidence. They are at the Docks because this
is already the island where work is handed out; a day's orders and a crew's orders are the
same errand, and two islands would be two trips for one idea.

`DailyOrders` is passed to `TrawlIndicator` as a **node**, via `before` — that file owns
trawls, and a second feature growing inside it is how a component ends up owning two things
badly. Claiming uses the fishing page's own `claimDailyReward` / `claimDailySweep`: two
surfaces, one payout, the same rule as the collection drawer.

**Both sending AND collecting happen here** (`canDeploy` / `canCollect`, true only at the
Docks). Splitting them across two screens would need explaining; one rule — the island is
where the crew are — needs none. On `/fishing` the panel is read-only: it shows the
countdowns and says **"Waiting at the Docks"** on a ready card.

That only works because the chart tells you. **The Docks island carries a gold "!" above it
and a "2 crew back" line above its name plate whenever somebody is waiting**, and the compass
promotes it over the nearest port — proximity is what you need to get home, but a dock with
a haul on it is the thing nothing else on the screen would mention.

It costs no polling: the page hands down the ISO moment each running trawl comes due, and the
map counts how many have matured on a 5s tick. A crew finishing while you are halfway to the
Abyss lights the island up on its own.

This is a **design gate, not a security one**, and it is client-side on purpose: the server
has no trustworthy notion of where the boat is (`profiles.sea_x/sea_y` is client-written and
documented as unvalidated), and a forged deploy buys nothing a player could not have had by
sailing there.

## With the rod out, the chart steps back

On a phone the catch moment had the water's name set enormous, a three-line hotspot
explanation, four compass arrows with names and distances, and every NPC's name plate — all
on top of the result card, the jackpot pill and the reroll button. The jackpot pill and the
hotspot badge were landing on each other.

The rule: **while the rod is out, the chart is scenery.** Anything that is about deciding
where to GO is not about what you are doing.

| gone while fishing | why |
|---|---|
| The compass | You are standing still on purpose. Four arrows with distances is the largest thing on screen with nothing to do with fishing. |
| The water's name banner | The stow line already reads "Stow rod · Open Waters". The same fact twice, one of them enormous. |
| NPC name plates and hail marks | You cannot hail anyone with a line in the water, so a label you cannot act on is furniture. The **boats stay** — they are the sea. |
| The hotspot's eyebrow, effect line and timer | An explanation is for the moment you sail IN. By the time the line is wet you have read it. |

The hotspot badge keeps its name and pips, shrinks to one line, and moves to **top-left under
the phase glyph** — out of the centre column, which the catch card, the jackpot pill and the
reroll button all share and where there was never room for it.

Everything comes back the instant you stow.

## Seeing each other (presence)

Mutual crew — you both pressed Follow — appear on the water as their real boat, with a
named compass arrow and a mark on the chart. Two layers, and they answer different
questions.

**AND AN ACCEPTED PACT.** Following each other is *not* consent to be tracked. It says
"I want to see what you are up to"; it does not say "I am happy for you to know where I am,
live, whenever I am playing". The game used to hand out the second on the strength of the
first. One captain asks, the other accepts, and either can end it at any time — a pact you
cannot leave is a contract, not consent.

The follow is the FLOOR (you cannot ask a stranger) and the pact is the permission. Both
are re-checked at read time, so unfollowing removes somebody from your water at once
without anyone having to hunt down and delete the pact.

`sea_pacts` holds one row per pair with a unique index on the **unordered** pair — without
`least`/`greatest` two captains asking at the same moment would end up with two pacts, and
ending one would leave the other standing. That index is also the race guard.

**BOTH captains must hold a Captain membership.** It grants no fish, no coin and no
progress, so it is a social perk and the no-pay-to-win rule is intact. Deliberately *both*,
not either: a Captain sailing with a non-Captain sees nothing, same as their friend.
Asymmetric visibility was rejected outright — being visible to somebody you cannot see
reads as surveillance, not as a perk they bought.

The gate lives in TWO places and only one of them counts. `friendsAtSea()` filters both
ends through `isPremiumActive`, which keeps a non-Captain's chart honest. But a client
belongs to its player, so the enforcement that matters is the RLS policy on
`realtime.messages` — without it anyone with a console could subscribe to `sea:<uuid>`
directly. `public.is_captain(uuid)` mirrors `lib/premium.ts` exactly, **including that a
null expiry means lifetime**; every current Captain is that shape, so a hand-rolled
`premium_expires_at > now()` would have hidden all of them.

**The backbone is a 20-second poll.** `friendsAtSea()` (`home/visitActions.ts`) says who is
out there and roughly where. It feeds the compass arrow, the crew list and the "so-and-so
has put to sea" line. One indexed query; the mutual-follow graph behind it is cached for a
minute because it is 27 rows and was being re-read thirty times a minute per player.

**The close-up is Supabase Realtime** (`lib/seaPresence.ts`), and only the close-up.
Positions go captain-to-captain at 2Hz while somebody is within `NEAR_ENOUGH` (2,600px),
and nothing goes on the wire at all otherwise. This replaced a poll that stepped up to 2
seconds when a friend was near — 600-1000px between samples, which no amount of easing
makes look like a boat.

### A POLICY'S SUBQUERIES RUN AS THE CALLER (2026-09, and it broke everything)

Realtime presence never worked. Not "worked badly" — **no captain could ever subscribe to
another captain's channel**, from the day it shipped, and the chart silently fell back to its
twenty-second poll. It was reported as "a huge delay in player positioning".

`public.crew` has RLS **enabled with no policies**, which denies every read to `authenticated`.
Every server action reads crew through the service role, which bypasses RLS, so nothing ever
complained. But the listen policy on `realtime.messages` carried a raw
`EXISTS (SELECT 1 FROM crew a JOIN crew b ...)`, and **a policy's subqueries execute as the
caller, not as the policy's owner**. That EXISTS returned zero rows for everybody, forever, so
the mutual-crew clause was permanently false and every join came back `CHANNEL_ERROR`.

SENDING was never affected, and that asymmetry is the fingerprint: the INSERT policy tests only
the topic and `is_captain` and touches no RLS'd table. The console said `could not listen to
<uuid>` and never `could not open your own channel`.

The fix is `app_private.is_mutual_crew(a, b)`, SECURITY DEFINER, exactly as
`app_private.is_captain` already was — and `is_captain` exists for THIS SAME REASON, because
`profiles` is own-read-only and a policy cannot read somebody else's premium either. The
pattern was established and crew simply did not get it.

**The rule: any table a policy reads must either be readable by `authenticated`, or reached
through a SECURITY DEFINER helper in `app_private`.** On this database, where the house
convention is service-role-only and most tables have RLS on with no policies, that means
essentially every cross-table test in a policy needs a definer. `sea_pacts` is the exception
and is left inline: it has a real own-rows SELECT policy, which is exactly the set the EXISTS
filters to.

Diagnosing it needed `?seadebug=1` (or the admin's Presence log switch in the Settings disc),
because everything about a refused join is invisible: whether a private channel joined is a
status on a callback, and whether a beat left is nothing at all.

### The audit (2026-09-10), after four separate fixes had not settled it

Every fault below presented identically — "multiplayer does not work" — which is why they were
found one at a time. Written down so the next one is not.

**Fixed, and each was sufficient on its own to break it:**

1. **A policy's subqueries run as the caller** (above). Nobody could ever listen. The big one.
2. **Two clocks.** The frame loop's `now` is the rAF timestamp, milliseconds since page load;
   every beat time is `Date.now()`, milliseconds since 1970. Ageing a beat with the wrong one
   is an error of 1.76e12, and the extrapolation multiplies a boat's velocity by it — she was
   thrown a trillion pixels off the chart the instant she moved and came back when she stopped,
   because stopping let the poll clear the pair. **Anything comparing against a beat uses
   `Date.now()`. The swell keeps the rAF clock: it is a phase, not an event.**
3. **A refused channel never retried.** It stayed in its map and every path that opens one skips
   a key it already holds, so one failure was permanent for the life of the page — a token that
   had not landed, a policy fixed while a tab was open, a tunnel, a lid, a cell handover. It
   backs off 1/2/4s to 30s now, re-runs `setAuth` first (the likeliest cause), resets on any
   success, and a fresh token clears every pending backoff at once.
4. **Destroy-before-build.** A friend stepping onto her warship was destroyed and then rebuilt
   with a texture decode in between, so she blinked out. Built first, swapped second.
5. **Extrapolation clamped the gap and kept the delta**, inventing a velocity ten times anything
   a hull can do out of two beats that straddled a gap in transmission. Stale pairs are discarded
   and fresh ones clamped to `MAX_BEAT_SPEED`.

**Verified sound, so nobody re-checks them:** `dt` is seconds and clamped to 50ms; NaN is guarded
at both entry points (socket payload and poll row); the poll never stomps a live beat, and a
polled row clears the velocity pair because a twenty-second-old position is not a speed;
teardown clears channels, timers and refs; `setCrew` cancels retries for captains who left.

**Accepted, by design:** it can take up to one poll (20s) to notice a friend has come into range,
because the poll is the discovery mechanism and beats only start inside `NEAR_ENOUGH`; your own
dial freezes your view of them; nothing goes on the wire beyond 2,600px.

### And you can watch them fish (2026-09)

A beat carries a POSE as well as a position: `p` is 0/1/2 for the three captain frames
(`rest` / `wait` / `cast`), one digit rather than the frame's name because it rides a message
that goes out twice a second. It is the frame `onPose` already hands the chart from
`FishingHere`, so what a friend sees you doing is what your own captain is doing, from one
source that cannot drift. The friend hull is a full `makeCaptain` composite, so `cap.setFrame`
draws them casting and working the reel with **their own rod** — no second animation to keep
in step.

- **A change of pose always beats the move gate.** Somebody working a rod is standing still by
  definition, so the gate that stops a moored boat costing anything would have swallowed every
  frame of it. Costs about three sends across a catch that lasts most of a minute.
- **Landing one is its own event** (`fish`, not `pos`): a moment rather than a state, so it
  must not wait for the next position beat. It fires from the same `onLanded` callback that
  draws your own splash, and the watcher gets that splash off the friend's EASED position, not
  the reported one, or the water breaks half a screen ahead of the hull.
- **Going quiet returns them to idle.** Beats stop when you are no longer near, so a friend who
  wandered off mid-cast is put back to `rest` after 6 seconds rather than holding the pose.
- **Your own dial freezes your map loop** (see the `dialUpRef` early-out) so the minigame gets
  the main thread, which means a friend's hull holds still while your dial is up. Accepted, and
  the canvas keeps running, so their catch splash still lands. Do not "fix" this by running the
  loop through the dial.
- Only the `?gpu=0` fallback needs React state for the pose; the canvas reads the ref in the
  frame loop, so the default path pays nothing for it.

Nothing here is shared state. Two captains fishing side by side are playing two separate games
that can see each other: separate rolls, separate holds, separate fog, separate everything.

### One channel per captain, never one big room

Supabase bills fan-out. From their pricing docs, verbatim: *"Each broadcast message counts
as one message sent plus one message per subscribed client that receives it."*

So a single shared channel is **O(N²) on the invoice**, and most of those deliveries go to
people on the far side of the chart who cannot see each other. Ten players at 2Hz in one
room is 200 messages a second — the entire 2M free monthly quota in under three hours.

Instead each captain owns `sea:<their uuid>` and broadcasts only there. Fan-out is your
mutual crew who are online, which is bounded by the **social graph, not the playerbase**. A
pair sailing together costs the same whether the game holds ten players or ten thousand.

| Rate | Per pair-hour | Free (2M/mo) | Pro (5M/mo) |
|---|---|---|---|
| 4 Hz | 57,600 | 35 h | 87 h |
| **2 Hz (shipped)** | **28,800** | **69 h** | **174 h** |
| 1 Hz | 14,400 | 139 h | 347 h |

Overage is $2.50/million, so ~35 more pair-hours per $2.50. Connections are a non-issue:
one websocket per player (channels multiplex), against a 200/500 quota.

Two further economies: a beat is skipped unless you have **moved** (`MOVE_MIN`), so two
captains moored side by side fishing cost nothing, and hidden tabs stay silent. It also
*reduces* database load — the position write went back to a flat 20s heartbeat instead of
stepping to 2s, and the poll stopped escalating too.

### The channels are private, and Postgres says who may join

`sea:<uuid>` is handed to every mutual friend so they can subscribe, and a shared secret is
not a secret. The `sea_presence_realtime_authorization` migration puts RLS on
`realtime.messages`:

- **SELECT** — your own channel, or one belonging to a mutual you hold an accepted pact
  with, where both of you are Captains.
- **INSERT** — you may send **only** on your own. This is the half that stops one player
  dragging somebody else's boat across the chart in front of everyone watching.

The receiving client therefore takes a friend's identity from **which channel the message
arrived on**, never from the payload — the channel is a fact the database enforced, the
payload is another browser's claim.

### Gotchas

- **The poll must not stomp a live boat.** Its rows are up to 20s old; a beat is 500ms old.
  `friendAt` carries a `live` stamp and the poll skips any boat heard from in the last 4s,
  or a friend you are sailing beside rubber-bands twice a minute.
- **Facing comes over the wire.** Inferring it from the easing delta is fine at 20s steps
  and flickers at 500ms ones.
- **"Are we together" is recomputed every beat**, against the freshest position held per
  friend — not off the poll payload, which is stale enough to rule you "not near" somebody
  filling your screen.

## The helm asks when it cannot tell

Everything you can act on from the deck is ONE list, `reach`, built in priority order in
SeaMap. The pill names it, the tap runs it, and when it holds more than one thing the helm
asks instead of guessing.

**There used to be two chains** — one building the pill's label, one performing the tap,
three thousand lines apart, each carrying a comment saying they had to stay in the same order
"or the button would be lying about what the thumb is about to do". They had already drifted:
an encounter sat 8th in the label and 4th in the action, so a captain floating in a portal
beside a boss read *Step through the portal* and got a broadside. That is not fixed by
re-sorting one of them. It is fixed by there only being one.

**The chooser fires only on genuine ambiguity** — moored between two people, or alongside a
rock with somebody anchored off it. One thing in reach still acts on a single tap, which is
every ordinary moment out here. The pill reads *"N things in reach"* rather than naming the
first, because a button captioned *Hail Meg* that opens a menu is the same lie the two chains
used to tell. It closes itself when you drift out of the ambiguity, because it is a question
about a moment and the moment ends.

**A refusal is not an option.** Holds (a locked node, a shut water, a band above your level)
never enter the list — a chooser full of things you cannot do is worse than silence. They
surface as the pill's hold line when nothing is actionable. Two of them still outrank
everything: the tutorial's one instruction, and a shut water she is physically stopped
against.

One behaviour deliberately changed: a locked encounter used to SWALLOW the tap so it could
not fall through to whatever else was in reach. Now it contributes a name to the hold and
nothing to the list, so the isle you are also alongside is offered — which is the whole point
of asking.

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

**It answers for the side you are sailing, and only that side** (`side: 'fishing' |
'anchorage' | 'bays'`). The compass was written when there was one sea and kept answering with
the whole chart after there were two: out in a bay it was still naming Open Waters, the
Ancient Deep, the Trawl Harbour and the zone's buyer — five arrows at fishing, none of them
reachable without a full crossing, on the one surface where the arrows ARE the navigation.
The split is the reef (`p.y < NORTH_WALL`) and it cuts both ways, so the Crew Hall and the
Forge stopped appearing over the horizon from the Shallows in the same change. Three values
rather than two because the expedition half has an inside and an outside: in the anchorage the
reef's gap is the way back and is named **Fishing**; out in a bay the sortie is between you
and that gap, so the harbour ports are dropped entirely (they are one heading printed three
times) and a single **The Anchorage** mark points at the sortie. Friends are filtered to your
own side for the same reason. On the fishing side nothing changed.

## What the campaign marks on the water

**A gold `?` over the next stop, a green tick over every cleared one** (`NodeGlyph`, worn by
`EncounterMark`, `CacheMark` and `BeatMark`). A bay is ten thousand pixels of open water with
a handful of things standing in it, and until this every one of them looked equally like the
thing to do — the compass says which way, this says which ONE. The `?` floats; the tick does
not, because a record that bobs is asking for attention it does not want. The tick is
`AshoreTick`'s disc and green exactly, which is what "you have been here" already means on
every isle south of the reef; a second green would be two lessons for one idea. Available but
not next gets **nothing** — marking every open stop would put a `?` on half the bay and answer
the question it was added to answer. Locked gets nothing either: the drained hull already says
not yet. `nextId` is the chart's own `nextStop`, the same answer the compass and the HUD use,
so the three can never point at different things.

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

## The chart (minimap + fog of war)

`lib/seaExplore.ts` + `sea/Minimap.tsx`. The chart button sits beside the phase glyph; the
map you play on shows about 800 world pixels of a sea that is 45,200 across, so at any moment
you can see roughly a three-thousandth of it. The compass says which way things are; it
cannot say what SHAPE the sea is or how much of it you have never crossed.

**Storage is a bitfield, not a list.** 700px cells over a 65 × 35 grid = 2,275 cells = **285
bytes**, base64ing to **380 characters**, and it never grows however far anyone sails. A list
of visited indices would run to kilobytes on a profile row read on every page load.

It is also **idempotent under OR**, which is the property that matters: two tabs, or a flush
arriving late, can only ever ADD cells. There is no ordering to get wrong and nothing to
reconcile — the worst a lost update can do is leave a patch foggy that you will sail again
anyway, because you cannot see what is in it. `saveSeaPosition(x, y, seen[])` reads, ORs and
writes, piggybacking on the position flush that already runs on navigation and every 20s.

**Reveal is a 3×3 of cells (2,100px) around the boat** — a little more than you can literally
see, deliberately: fog that clears exactly to the edge of the viewport reads as a spotlight
following you around rather than a chart you are filling in.

**Ports are never fogged.** A chart whose own harbours are hidden until you have been to them
is a puzzle, not a chart, and you cannot get lost looking for somewhere you already know the
way to. The zone buyers and Yoon are marked **only** in water you have uncovered — finding
them is the point.

Measured: 100% is genuinely reachable (1,646 water cells, all of them coverable), a fresh
captain starts at 0.4%, garbage decodes to empty rather than throwing, and every port plus
Yoon lands on the grid.

**`SeaLook` gained a `solid`** for this. The minimap paints 2,275 cells into a canvas and
`ctx.fillStyle = 'radial-gradient(…)'` is not an error — it is a silent no-op that leaves
every cell the previous colour. The five bands come out 47 apart from the fog on the widest
channel, so water reads as water.

## The land

Still no island art — this is all CSS, and it is scaffolding for real plates. But it stopped
being a brown potato.

**The coastline** is five octaves seeded off the place id: a lobe term that pulls one or two
whole sides out into headlands, then successively finer detail. Per-island ruggedness varies
too, so one is round and another is craggy rather than all of them being equally lumpy.

**Tuned against measurements, not by eye.** The first pass ran to a **7.5% radial jump between
adjacent points** — a saw tooth — and pinched one island to a **17% waist**, nearly severing
it. Searched for a set that holds, across all four islands: radius 30–63% (no pinch, nothing
past the box), biggest neighbour step **2.4%** (a rocky notch over a ~12px arc, not noise),
all four outlines distinct, and land still present at the innermost terrain band. 160 points,
because at 26 the straight segments were visible on the big islands and read as a polygon —
which is exactly what makes a shape look drawn rather than surveyed.

**Then six of the ten came out as the same island, and it was arithmetic.** The lobe term
above ran at a period of ONE OR TWO. A period-one term is `sin(a + phase)`, and a shape built
on one has the property that opposite radii always sum to the same number: every diameter
identical, a curve of constant width. Measured across the chart, six islands sat at an aspect
of exactly **1.000** and the other four between 1.4 and 1.55. Two families, one of them
perfect blobs, and no amount of texture painted on top fixes a silhouette that is
mathematically a circle. Octaves cannot fix it either, because period two is the only octave
that changes aspect at all and it was sharing a slot with a period-one term that does not.

So the outline is three seeded things now, on top of the octaves: **an axis**, so each island
is stretched along a bearing of its own; **a headland** with its own reach rather than a fixed
one; and **a bay** on about half of them, a gaussian bitten out of one bearing and the only
feature here that is not a smooth harmonic.

**The bay is always on the seaward side, and that is an invariant.** Bearings on the chart are
screen bearings, so with y running down the page **90 degrees is south** — and the south face
of every island is the settled one. It is the face the camera looks at, the berth ring sits
east-south-east of it, and every building table on the chart puts its houses below the centre
line. The bay is the deepest single bite the generator takes, and left free it took the
Mainland's south face down to **17.9%** of the box while its north-west stood at **38%**: the
town was over the water, and the same bite caught the Estate and the Crew Hall's stores.
Moving three buildings would have fixed those three placements. Restricting the bay to the
seaward half fixed the rule, and it is what a coast does anyway — the drama goes on the side
you sail past, the harbour side stays whole.

**A soft limiter, not a clamp.** Three independent terms stack, so the radius needs a floor
and a ceiling or a bay landing on the narrow end of a stretch pinches the island to nothing.
A hard `min`/`max` pinned **26 of the Mainland's 160 vertices** to the floor, which is a
circular arc sitting in a hand-drawn coastline and reads instantly as machine-made. It is
`48 + 21 * tanh((r - 48) / 21)` instead: the band is approached and never reached, so nothing
is ever flat. Aspect now runs **1.04 to 1.30** with radii from 30% to 67%, biggest neighbour
step 1.2 to 2.8%.

**`check-islands` is the gate on all of this** and it caught every one of the three overhangs
the moment the land moved. Anything that changes `coastline()` gets re-run against it, and a
building that fails is re-placed rather than the check being relaxed.

**The terrain is bands that follow the coast.** It was one flat radial gradient of brown; a
single colour with a vignette is a shape, not a place. Each band is the *same* polygon on a
smaller box, so its clip scales with it and every ring parallels the shore instead of being a
circle sitting inside an irregular outline. Outside in, the way you would walk it: wet sand,
dry sand, scrub, grass, and a lighter crown where the ground rises — the crown offset toward
the same corner every other highlight on the chart is lit from, so the scene agrees about
where the sun is. Then soft dark clumps for woods: not trees (a tree is two pixels here) but
the massed shadow a stand of them throws.

**Five coasts, not one coast on a dial.** Every island drew the same five hardcoded bands -
one sand ramp, one green ramp - with a warm-to-cool shift laid over the lot. That was not
enough and could not have been: a dial makes ONE place at two temperatures, so ten islands on
one dial are ten copies of a coast at ten temperatures, which is exactly how they read. There
are five whole palettes now (dune, basalt, chalk, redstone, jungle), each carrying its own
sand, scrub, canopy AND rock, because a chalk island with a basalt cliff is two islands
wearing one coat. An island draws one off its seed and the dial runs INSIDE it, halved, to
separate two islands that drew the same family. Across the ten ports all five are in use.

**And the texture was eating all of it.** Five whole palettes shipped and the islands still
looked identical, which was not the palettes' fault. `ground-turf.png` is a fully opaque
painting with a mean of (185,185,121) and it was going on `source-atop` at 0.42 - that does
not texture the land, it REPLACES 42% of it with one shared yellow-green, the same 42% on
every island. Measured across the ten ports: authored separation in the green band ran 2 to
91, what reached the screen was 1 to 50. Half the difference thrown away, and the dark
palettes crushed into each other, because the darker a colour is the more a fixed blend toward
a light one dominates it. The plate is desaturated and pulled half way to mid grey once, then
laid on in **soft-light**, which contributes no hue at all: it modulates what is underneath
and a chalk island stays chalk. Same measurement after: **3 to 111**. Pulling the plate toward
mid first is what keeps it a modulation rather than a bleach - a texture whose mean sits well
above mid lightens everything it touches.

### A dead colour presents as a dead camera

This dial then took the whole chart down, and the shape of the failure is worth more than the
bug. `toneHex` clamped each channel to 0..255 and THEN multiplied by `dim`, which is
`1 - k * 0.055` and therefore GREATER THAN ONE on any island whose `chr` is under a half. A
channel clamped to 255 came back out at 260; `260 << 16` prints as seven hex digits; and
`#104f1ca` is not a colour, so `addColorStop` throws SyntaxError on it.

That throw was inside `bakeIsland`, so inside `place()`, so inside the loop that places every
island - and **everything built after that loop, the GPU handle included, was never built.**
SeaMap reaches the handle through optional chaining, so every `camera()` and `skipper()` call
after it silently did nothing. What a player saw was a chart frozen in place with no boat on
it, while the water carried on animating off the Pixi ticker's own clock, because the ticker
had already started.

Two things to take from it. **Optional chaining on a handle turns "it crashed" into "nothing
happens",** which is a much worse bug to be handed: the camera, the boat and the labels all
died three files from the actual fault and none of them logged anything. And it needed one
palette AND one seed together - the Crew Hall's - so nine islands baked and the tenth did not,
which is why it survived a build, a typecheck and `check-islands`.

`scripts/check-palettes` walks every palette colour through every island's dial and asserts
six hex digits. It checks the whole grid rather than the pairing each island happens to draw,
because the pairing comes off a hash and the next change near `paletteOf` reshuffles it. It
fails on the version that shipped, which is the only way to know a check is worth having.

**The lesson is worth more than the fix.** An opaque texture composited `source-atop` is not a
surface, it is a second colour, and it will quietly average away every colour decision made
underneath it. Anywhere a shared plate goes over per-thing colour, it has to be grey and it
has to be a blend mode.

**The landing is a notch, not a half of the island.** The first cut of the height profile was
one cosine, high opposite the berth and low at it. That fixes the docking and flattens far
more coast than it needs to - and because the base outline sits inside the face outline at the
far side, the wall only ever SHOWS on the near shore, so the half it flattened was the only
half you could see. The islands read as flat again with all their height hidden behind them.
The beach is a gaussian notch centred on the mooring circle now, over a two-fold ridge with
headlands at both ends of a seeded line. Measured across the ten ports: 0.08-0.13 of full
height at the berth, 0.5-1.0 by the south-west. Land where you land, cliff along the rest of
the way in.

**The wall knows where the waterline is.** The extrusion is three outlines: the top face a
lift above the plane, the waterline on it, the cliff base a lift below. That last one was
painted the same dark brown as the wall and painted OPAQUE, so the biggest islands sat on a
plinth and the shore bands and surf the water shader draws right up to the coast stopped dead
at the island instead of running under it. Because the two offsets are symmetric, the
submerged band is to the pixel where the reflection of the wall goes — it was already the
right shape, it was just painted as rock. It is translucent now, on the wall's own ramp
mirrored (darkest at the line, lightening downward, gone), cut into slivers by alternating
bands of alpha so it reads as a surface with swell on it rather than as a shadow. It shows as
a crescent on the SOUTH shore, which is geometry rather than a choice: at due north the base
outline sits inside the face and is covered, east and west the two cross, and only on the near
side does the base clear — which is the one place a reflection would be visible anyway. Above
the line the wall is walked as **quads, one per pair of the coastline's 160 points**, each
filled by its own height: a single fill cannot know that this quarter of the coast shelves and
that one does not, which is why the landing used to be painted the same dark rock as the
headland. `shoreness` drives the colour from the palette's `beach` to its `rock` and the
strength of the reflection with it - a beach reflects almost nothing, having almost nothing
above the water to reflect. Each quad is stroked in its own fill as well as filled, or canvas
antialiases both sides of every shared seam and leaves a hairline of background between them.
**Strata** go on the same way, segment by segment: curves traced at fractions of the lift so
they run parallel to the shore, faded out where the wall shelves, pale because they are ledges
catching sky and dark ones read as cracks. Sand has no bedding planes in it.

**Surf** is two collars hugging the coast, breathing slowly and **out of phase** — in phase
they read as one ring pulsing, which is a UI element; out of phase they read as swell
arriving. Water hitting a shore is the most recognisable thing about a shore, and without it
the land met the sea on a hard vector edge, which was most of why these read as shapes.

**The shoal** widened from a 6px-blurred halo at inset 2% to three soft layers from −6%
outward. Shallow water round a real island is a broad pale shelf that fades out with no edge
anywhere; a thin halo is a glow.

## The discoverable isles

27 small islands ringed round the five bands, `web/lib/seaIsles.ts`. They exist because
**the bands reward depth, which is one axis** — before these, the whole east and west of
every band was scenery. They are the reason to sail sideways.

- **Spread by BEARING, not scattered.** The placement pass (`web/scripts/place-isles.mts`)
  slices each band's semicircle and puts one isle per slice, then rejection-samples against
  every port, landmark, moored trader and each other. Re-run it if the chart's furniture
  moves; its OUTPUT is baked into the table, because a discovery has to be in the same place
  tomorrow.
- **Ashore rings never overlap** (1,478px apart at the tightest). One landing offers exactly
  one isle, so the action button is never ambiguous.
- **`r` floors at 130.** The boat is 210px wide. An earlier pass placed isles at r 87, a
  174px island narrower than the boat moored at it, which reads as a stone you would run
  over rather than landfall.
- Every isle sits **wholly inside its band**, which is what makes the level gate honest.

### What they pay, and the rule the curve follows

18 caches hold **2,000 ◆ and 99,000 ⟡ in total**, one payout each, ever. **The bands do not
overlap**: the meanest cache in a band always beats the richest in the band inside it
(Shallows 35 ◆ → Ancient Deep 175-200 ◆), so sailing further is never a downgrade. Values
are written per isle rather than derived, so one rock can be tuned without moving a curve.

Nine isles pay nothing and hold a **note** instead. Near water carries **chart hints** —
plain and literal per the mechanics-copy rule, and each one asserts something true of the
live game, so a note is part of the surface of whatever system it names and has to move when
that system is retuned. Far water carries **logs** from crews who sailed too far. Notes stay
on the rock; you can read them again.

**Notes must not touch the campaign.** The Sunken Hand arc is delivered north of the Harbour
and its reveal leaks through incidental copy — see [story-universe.md](story-universe.md).

Isle names and note text are registered in `web/scripts/check-copy.mts`, so the no-em-dash
rule enforces itself.

### Once is enforced by the database

`sea_discoveries` (user_id, isle_id) with a **unique index**, RLS select-own, writes via
service role. `goAshore` **inserts before it grants** and treats 23505 as "you already have
this one". It is deliberately NOT select-then-insert — that is a check and a write with a gap
between them, which is the shape `collectTrawl` has and the reason it can double-grant.

The real gate on reaching an isle is its band's `minLevel`, which the server knows and cannot
be forged. The position check against `sea_x/sea_y` is **best effort and documented as such**:
`saveSeaPosition` does not validate what it stores, so a forged position only means lying
twice. Making this properly unforgeable would need server-side boat simulation.

### Adding one later

The type carries a warning worth repeating: **`id` is the primary key of a discovery row**, so
renaming one un-finds it for everybody who found it. To add an isle, place it, give it an id
that will never change, and add its reward. Special items were asked for and the shape is
ready — extend `Isle` and the payout branch in `goAshore`, which is the only code that may
believe a reward.

## Each band has its own water

`web/lib/seaSurface.ts`. One texture per fishing band, shallow to deep: **weed, chop,
current, silt, glass**. The water settles and then stops as you sail out.

### Why this is keyed to the bands, not to sectors

An earlier pass built **angular sectors** — a longitude axis, on the reasoning that the east
of the Deep looks like the west of it. That was the wrong problem: **nothing in this game
depends on which way you are.** Levels, fish tables and sell prices all key off the band. The
sectors were a second set of names to learn laid over a system that already meant something
and carried no texture. They were removed.

### The problem this actually fixes

Average per-channel distance between consecutive band palettes:

| step | distance |
|---|---|
| Shallows → Open Waters | 9.6 |
| Open Waters → The Deep | 16.7 |
| The Deep → The Abyss | 21.2 |
| **The Abyss → The Ancient Deep** | **7.6** |

The weakest step on the chart is the one that should be strongest — both deepest bands are
nearly black and nearly the same nearly black. **Colour cannot fix it**, because both are
meant to be dark. Silt against glass reads at any brightness.

### Form, not colour — because day/night already owns colour

Hue is spoken for twice: the band picks the palette via `seaAt`, and the 48-minute clock
tints the whole frame. A third system reaching for hue fights both and looks like a different
place at dawn than at midnight. So a surface is a *texture* and a *drift rate*.

The one place the two systems meet is `inkStrength`: **light ink** is light ON water and dims
with `lum`; **dark ink** is a thing IN the water and stays. Without the split the kelp
vanishes at midnight and the chop glows.

### Implementation notes

- One tiled layer between the deep mottle and the pale wash, moved by transform. Never
  repainted.
- Crossing **cross-fades over 0.75s each way**; the image only changes while opacity is 0.
- `makeMottle` takes optional fixed `squash` and `tilt`. Fixed tilt is what turns a scatter of
  blobs into a current: the marks stop being independent and agree with each other.
- Tiles build on a 400ms idle timer after mount so the first crossing does not hitch.
- **A surface you cannot see is not a surface.** Two were first authored faint and were
  indistinguishable from open water on a comparison plate. Render the plate before trusting
  these numbers.

## The minimap

Sized to the **chart's own aspect** (45,200 × 24,100, ≈1.88:1). It used to be drawn into a
square and scaled to fit, so 47% of the canvas was blank by construction — the sea now covers
**80% of the canvas instead of 43%**. That was the empty space, not the fog.

Carries a **key** built from the same `INK` table the canvas draws with, as SVG at the
canvas's own radii, so a swatch is the same size as the thing it stands for. Add a mark to the
canvas and it needs a row in the key.

The tally shows isles ashore and holes dug, where **dug counts bearings you hold, not sites
that exist** — how many there are is not something the chart will tell you.

**The key only explains what THIS half draws.** Places and Faces are the fishing sea's — the
isles, the dig sites, the buyers, the regulars and Finn are all south of the reef and none of
them is drawn out past it — so on the expedition chart those nine rows explained marks that
were not there, above the six that mattered. A key to things you cannot see is worse than no
key: it sends you looking. The one face that can be out there is another captain, and that
mark labels itself (it prints the username beside the dot), so it is the one row that never
needed the key.

**A bay is water, not a region on a diagram.** Each was filled and then given a hard gold
ring: five exact circles ruled onto a painting. Out there a bay has no edge you can see, it is
where the water changes colour, so the map says that with a radial stop that fades to nothing
at the rim and lets the deep behind it take over.

**And a bay you have not opened does not say its name.** It printed the title in grey with
SHUT over it, which hands a captain in chapter one the name of every chapter left — the same
spoiler the campaign panel was giving away in its rows, on the one surface that exists to show
what you have FOUND. A shut bay is dark water with a numeral on it: there is a chapter three,
and that is all.

## Bottles, bearings and buried treasure

The renewable half of discovery. The isles are finite — 27, one payout each — so after a
fortnight the sea had nothing new. `web/lib/seaBottles.ts` and `web/lib/seaDigs.ts`.

### Bottles carry words, never coin

**This is the load-bearing rule.** Something infinite that pays out is something you farm,
and the moment a bottle is worth money the correct way to play is to sail in circles
harvesting them. Bottles hand out log fragments and BEARINGS; the coin lives in the finite
dig sites, so the total on the chart is fixed however many bottles anyone opens.

- Derived from the same cell hash as the traders (`bottleAt(cx, cy, win)`), so client and
  server agree with no round trip and a forged key resolves to nothing.
- `BOTTLE_CELL` 2,600 at an 18% rate; `BOTTLE_WINDOW_MS` 11 minutes — deliberately NOT the
  hotspots' 10, so the whole sea never blinks at once.
- They drift via `bottlePos` written by the frame loop onto a ref'd node, exactly like the
  trader patrols. Never through React.
- `bottleFromKey` refuses anything older than the previous window.

### Bearings are chosen per captain, on the server

About 34% of bottles carry one (measured over 1,177 bottles). Which site it names is decided
in `openBottle`, not baked into the bottle: never one already held, never one in water the
captain's level has shut, nearest first. Once they hold them all, every bottle is a fragment.

Bearings are written in metres (`world / 10`), the same unit the compass readout uses.

### Dig sites are the only unadvertised thing on the chart

Everything else announces itself once the fog clears. **A dig site is never drawn and never
pinned in any state** — the minimap shows an X only for a bearing you have been given. Two
ways to end up on one:

1. A bottle told you.
2. You sailed across it. Deliberately possible: the water reads faintly wrong within
   `DIG_HINT_RANGE` 900, which measures out at about **one part in 26 of the sea**.

12 sites, **1,600 ◆ / 70,000 ⟡**, every dig out-paying the isle cache in its band, bands
never overlapping. **With the isles that is 3,600 ◆ / 169,000 ⟡ for the whole chart** — the
number to look at when retuning. Both tables are flat literals for that reason.

The claim is a **conditional UPDATE** on `dug_at is null`, so a second tap returns no row and
pays nothing. `sea_digs` holds both states in one row (`bearing_at` set, `dug_at` null = you
know where it is; both set = done), because a dig row that could exist without its bearing is
not a state the game has.

## Movement: forward and sideways are different things

The whole model used to be **one lerp of the velocity vector** toward the target vector. That
does two jobs at once — reaching top speed and changing direction — which is why acceleration
and handling were the same number, why neither could be tuned separately, and why nothing
could slide: velocity had no memory of where the bow pointed, so there was no such thing as
sideways.

Now, per frame:

1. **The bow turns** toward the order, shortest way round, capped at `TURN × rudder × trim`.
   That is handling, and it is now a real number.
2. **Forward speed chases** the target at `ACCEL × rig × trim`.
3. **Leftover sideways velocity bleeds off** at `GRIP`. That is the drift — the *absence* of
   full grip, not a new system.

Everything downstream still reads `vel`, so the shoreline pushback and the north wall needed
no changes: they act on a velocity vector and this still produces one.

**`GRIP = 6`, which is feel-only.** Measured on a hard 90° turn at 300 px/s: the stern steps
out to ~31% of forward speed and she is straight again inside 1.1s, most of that being the
turn. **Lower this one number to make drift a mechanic** — nothing else has to change.

A nice emergent property, not designed in: **a livelier rudder slides more.** Turning faster
generates more lateral velocity, so the Spade Rudder peaks at 126 px/s of slide against the
stock rudder's 94. The best rudder is both sharper and looser, which is what a good rudder
actually feels like.

### The ladders

| | | tiers | ladder cost |
|---|---|---|---|
| **Hull** — top speed | 100% → 175% | 6 | 180,000 ⟡ |
| **Rudder** — turn rate | 100% → 155% | 4 | 78,000 ⟡ |
| **Rig** — pick-up | 100% → 165% | 4 | 78,000 ⟡ |

Stock rudder turns 90° in 0.65s, best in 0.42s. Stock rig reaches full speed in 1.15s, best
in 0.70s. The two short ladders are deliberately shorter than the hull's: the hull is the
headline upgrade, these are what make it pleasant.

**They multiply on top of the boat's trim**, which still trades speed against nimbleness. The
ladder is what money buys; the trim is what you choose. `LoadoutStats` shows the product,
because that is what the map actually steers with — quoting either half alone would be a
number the water disagrees with.

## Every surface has a way out, in the same corner

Anything you can open from the chart closes from the **top right**, so a thumb always knows
where to go. Audited, and three were missing one:

- **The Shipyard** had only a "Back to the water" link at the very bottom of a long page —
  on a phone that is a full scroll away from wherever you happen to be reading.
- **The trader panel** had "Sail on" and "No thanks", which are *answers*. Somebody who opened
  it by accident should not have to pick one.
- **The tackle box** closed on a backdrop tap and nothing else. A gesture nobody is told about
  is not a way out.

Both *pages* (Shipyard, Trawl Docks) leave with `router.back()` when the chart's breadcrumb is
present, falling back to a push — a push mounts a second `/sea` over the one still in history
and remounts the whole chart from cold, which is a visible reload of a screen nobody left.
Guarded on the breadcrumb rather than `history.length`, which counts other origins and would
walk somebody out of the site on a deep link.

`/sea` is in the nav for admins, so the Mainland's three destinations (tavern, market, tackle
shop) already have a way back and are left alone — they are ordinary app pages reachable from
the nav too, and a sea-specific X on them would be furniture everywhere else.

## Controls that are not the sea

The map steers on **two** paths — `onDown` (pointerdown, for the thumb helm) and `onTap`
(click, for a course order) — and a control has to be exempt from **both**. `onDown` bailed
on `closest('button, [data-no-steer]')`; `onTap` did not, so anything marked `data-no-steer`
still put the helm over on the click that followed. The level bar was the one anyone would
notice, because it looks tappable and past Fishing 100 genuinely is.

**A control is a control on every path that can reach it.** When adding a new steer path,
copy the guard.

**And a press that did not land on the chart is not the chart's.** Both paths now bail on
`!wrapRef.current.contains(e.target)`. A React **portal bubbles along the React tree, not the
DOM one**, so every overlay this file opens over `<body>` — the fight, a story beat, a sheet —
delivers its presses to the map as though they had happened on the water. `fightOnRef` covered
one of them by name; this covers all of them, including the ones nobody has written yet.

It is not cosmetic. The last line of `onDown` **captures the pointer** to the chart, and once
it has, the click that follows is retargeted to the capture element — so the overlay's own
`onClick` never runs at all. That is why tapping through a story beat did nothing while the
boat quietly took a heading behind it: not a z-index problem and not a pointer-events problem,
a pointer-capture problem. A press that landed elsewhere has to leave before the capture.

The bar itself was also mounted without `renownAvailable` or `onOpenRenown` — `XPBarDisplay`
only makes its MAX chip tappable when both are set — so a captain at 100 had a Renown readout
they could not open. `/sea` reads `getRenownState('fishing')` on the page now and hosts
`RenownPanel`, and the available count comes straight off the state rather than being
recomputed (it is derived server-side on read and on every commit; a second computation would
be a second source of truth).

## Performance

The 60fps loop writes `style.transform` imperatively and React never sees it — see the
backdrop note for what happens when both try to own a property. React is here only for things
that CHANGE: which water you are in, who you are alongside, which hotspot you are standing in.

**Three things were undoing that, all found by reading the tick rather than guessing:**

1. **`setTick` fired 8×/sec and its only consumer was `key={tick > -1 ? place.id : place.id}`
   — both branches identical.** Dead state re-rendering the entire map 500 times a minute to
   produce the same tree: every island, every landmark, every trader, ~103 memo'd children a
   render, 51,500 reconciliations a minute. Deleted outright.
2. **`hullRef={el => …}` was an inline arrow**, so every render handed each `TraderBoat` a new
   function — a changed prop, so `memo` never once matched and all forty boats re-rendered
   anyway. A memo that always misses is worse than none: it pays for the comparison and
   re-renders regardless. Now cached by key in a ref.
3. **`hotspotAt()` re-derives all three patches from the clock on every call** — filter the
   bands, hash, build the objects — and it ran on every proximity tick. The in-a-hotspot test
   now does three distance checks against the already-memoized `spots` array.

What remains that can re-render the map: a band crossing, an encounter, entering or leaving a
patch, the 15s hotspot refresh, and the 5s trawl-ready count (which no-ops when unchanged).
Sailing across open water now reconciles **nothing**.

## Art

`public/sea/` — buildings (tavern, market, tackle, harbour, lighthouse) and landmarks
(buoy, islet, wreck, rig, bones, monolith). Generated through the Kie pipeline documented
in the `nano-banana-2` skill, painted on **flat magenta** and chroma-keyed
(`m = min(r,b) - g`), because asking the model for a transparent background returns a
painted checkerboard. Style is matched against `public/crew/hall_*.png`.

**Landmarks are submerged, not floated.** Two earlier attempts drew something *underneath*
the sprite — a dark ellipse, then a pale one — and both read as an object hovering over a
surface. The smudge was never the problem; the **crisp bottom edge** was. A hard-edged object
with a smudge under it hovers, every time.

So the sprite's own base is masked away instead (`SUBMERGE` in SeaMap): solid down to the
waterline, then a **step** to a fraction of its opacity — what you can still make out through
the surface — and out to nothing. The step is what sells it: a smooth fade from 1 to 0 reads
as the object dissolving, a step to a low plateau reads as a change of *medium*. `keep` is
never 0, because something that vanishes exactly at the waterline has been cut, and the eye
finds that straight edge immediately.

| | waterline | still visible under |
|---|---|---|
| wreck | 62% | 26% |
| buoy | 66% | 30% |
| bones | 74% | 24% |
| monolith | 78% | 20% |
| rig | 80% | 22% |

**Islets are land** and get the islands' shoal instead — they have a beach, they do not go
under. A check asserts every art file on the chart is either submerged or land, because one
that matches neither silently gets no waterline at all.

**Nothing is drawn beneath a submerged landmark. Fourth time of asking.** A dark ellipse,
then a pale one, then a pale one dressed as foam and called a "wash" — every version reads the
same, because the objection was never the colour. A discrete shape sitting beneath another
object says *this thing is above that thing*, whatever tint you give it. Foam you have to
argue is foam is a shadow.

The fade is the whole effect. If a landmark ever reads as floating again, take **more** of it
under the water; do not put something back underneath it.

Islets are not an exception to that rule — they are land, they do not go under, and a shoal
is shallow water round a beach, which is genuinely there. Islands keep their offset contact
shadow for the same reason: they are extruded solids and it is correct.

Placement is **solved and asserted, never eyeballed** — buildings inside the coastline,
landmarks inside their zone and clear of each other, resident buyers reachable. Four of
five buyers were first placed inside solid landmarks, which would have made them literally
unreachable.

## Salvage — the best furniture cannot be bought

The top rung of every interior ladder has **no price**. Six isles in the Abyss and the
Ancient Deep hold the only copy of one piece each:

| Isle | Piece | Band |
|---|---|---|
| Coldwater Cay | A wall of sea-glass | Abyss |
| The Drowned Step | An abyssal weave | Abyss |
| The First Stone | An abyssal firestone | Ancient Deep |
| Worldsend Rock | An Ancient Deep giant | Ancient Deep |
| Stillwater Isle | A star-glass table | Ancient Deep |
| Nobody's Rock | A tide orrery | Ancient Deep |

All six are 1,300–2,100m from home, so each is a real voyage.

**Why.** The finest room in the game used to be a readout of how many doubloons its owner
had. A captain who has stood on Worldsend Rock now owns something a richer captain cannot
order, and the only way to catch up is to sail there too. It also gives the isles a reason
to exist past the first visit — they paid gems and coin, which are the same gems and coin
as everywhere else; now six of them pay the only copy of something.

**Two traps this had.** A found piece carries `cost: 0` because it genuinely has no price,
and `furnish()` guards payment on `item.cost > 0` — so without an explicit `item.found`
check, the six best pieces in the game would have been free to anyone who tapped them.
And the picker's `paid = cost === 0` test read them as gifts for the same reason.

The grant sits inside `goAshore`'s insert-took branch, so the unique index on
`sea_discoveries` is the guard and it cannot pay twice. It appends to `owned`, so from then
on the piece behaves like one that was paid for — put it out, take it down, put it back,
free. It is *how you got it* that is different.

**Sink impact:** `HOMESTEAD_FLEX` fell from 8,420,000 to 5,210,000 doubloons. That is
deliberate — 4.45M of the old sink was the six pieces, and they are now earned by sailing
instead. `ISLE_FURNISHING` in `lib/seaIsles.ts` and the `found` fields in
`lib/homestead.ts` are two halves of one fact and a check asserts they agree.

### is_captain lives outside the REST API

`profiles` is **own-read only** — its single SELECT policy is `auth.uid() = id`, so nobody
can see anyone else's membership. A `public.is_captain(uuid)` handed that back out one uuid
at a time, because PostgREST serves `public` and RLS policies run as the connecting role,
so it had to be EXECUTEable by `authenticated` and was therefore callable as
`/rest/v1/rpc/is_captain`.

It lives in `app_private` now, which PostgREST does not serve. The policies still call it;
there is no HTTP route to it. Supabase's own security advisor is what surfaced this.

## Teaching the chart (first run)

Two pieces, split by **when the knowledge is usable** rather than by topic.

**The arrival walkthrough** (`SeaTour.tsx`) — five cards, 91 words, shown once and latched
on `profiles.has_seen_sea_tour`. It covers only what you cannot use the chart at all
without: steering, that Cast appears in open water, the chart button, that there are isles
and bottles and buried things out there, and that the islands round about are places you
can moor.

**Landfall hints** (`SeaLandfallHint.tsx`) — one line the first time you come within
mooring range of the Shipyard, the Trawl Docks or the Homestead, latched per-port in
`profiles.sea_hints_seen`.

**Why not one twelve-step tour.** Every one of those subjects deserves a sentence, and
twelve sentences at minute zero is a manual, not a tour: the captain skips it and learns
none of them. A line about the Trawl Docks lands when you are tied up at the Trawl Docks;
the same line on arrival is about a building you have never seen, half a chart away.

The hint fires on **approach**, not on entering, because "what is this place" is the
question a captain has when a strange island's name comes up — before the decision to go
in. It clears when you sail off, since leaving is an answer.

`sea_hints_seen` is a `text[]` rather than three booleans: the list grows every time the
chart gains somewhere to land, and a column per port is how a profiles table ends up with
forty of them.

## Nothing on this sea is painted onto it

Anything the chart draws ON the water darkens it by MULTIPLYING, never by painting. Black
pixels laid over the sea replace it, so every wave, glint and caustic under the thing is
simply gone and it reads as a picture stuck onto the chart. Multiply darkens the same pixels
while the surface keeps running through them. `seaPortalWell` has carried this rule from the
start; the maelstroms' dark half was drawn normally until 2026-09, which is most of why they
looked laid on.

The second half of the rule is that the effect must not END anywhere. A gradient that reaches
zero inside its own radius leaves a clean circle of untouched water around it, which is an
edge, and an edge is what the eye reads as a decal:

- The wells carry a **shoulder** (`hazeS`), the same gradient at 3.3r and a fifth of the
  weight, so the sea starts going quiet a long way out and only deepens near the mouth.
- The maelstrom's **storm skirt** has a floor (0.26) rather than scaling from nothing with
  proximity, so a maelstrom on the horizon still sits in a wide patch of troubled sea instead
  of being a hard disc against clean water.
- Neither goes to flat black in the middle either: the well throat is 0.88 and the maelstrom's
  funnel and hole were eased when they moved to multiply, because under multiply they bite
  harder than they did painted.

## The maelstrom has a throat

The keystone laid the mouth on the water at an angle, but the eye was still on the rim's
plane, so it read as a stain that turned. Since 2026-09 (`seaMaelstrom.ts`, "AND IT HAS A
THROAT") the mouth sits over a stack of six **terraces**: each a multiply ring and an additive
turning band, each smaller than the last, dropped BELOW the plane (+y/GROUND, the inverse of
how a mast stands up) and darker for stacking. The eye, core, beam and spirits live at the
floor; spirits fall down the wall or climb out of the hole. The whole throat **leans toward
the camera** in proportion to depth (`LEAN`), which is the parallax a hole has and a stain
does not. `DEPTH` (0.2r, screen) is held under the mouth's near edge so the floor is always
seen through the mouth. The flat `hole` sprite is gone: the black in the middle is depth, not
paint. Both gauntlet Slipways host this same renderer and inherit all of it.

**The keeper stands IN the throat.** Davy and the Don used to hang at a fixed height over the
middle of the mouth, which is all there was to stand on. They are rooted at the floor now and
climb it as you approach (`fy * (1 - 0.85 * gg)`): far off, the foot fade baked into
`holoTexture` dissolves them to the chest, so what you see over a distant maelstrom is a head
and shoulders coming up out of the dark; alongside, they are all but standing in the mouth.
They ride the throat's lean with the floor, so they leave the centre of the hole only when the
hole does. Do not re-pin them to the rim: the fade is cut for a figure whose lower third is
below the waterline.

**The skirt streams, and she leans into it.** The pull in SeaMap has always dragged the hull
toward the eye; nothing on the water or on the ship agreed with it. Now five crests race
inward across the skirt (2.6r to 1.02r), shrinking and turning faster as they close, fading in
and out at both ends, with one broad spiral turning over the whole patch — all additive, all
with a floor so a maelstrom on the horizon still sits in moving water, all under the mesh so
the mouth takes them at the lip. And the hull HEELS toward the eye (`maelLeanRef`, up to about
7 degrees at the centre of the grip, summed across maelstroms, eased out over the same half
second when a fight starts or she sails clear). The lean is a screen tilt and therefore lives
inside the `* facing.current` group with the drive heel and the turn lean.

**And the lip breaks.** A hard thin band at the top of the throat (u = 0, the rim the terraces
start from), breathing with the funnel so the edge and the hole are never a pixel apart,
shimmering on two out-of-step sines because a band pulsing on one is a band pulsing. Twenty-six
specks of spray come off it per door, thrown on a parabola so they leave the water and return
to it, carried round with the rim and drifting INWARD while they are up — what comes off this
lip is being taken, not escaping. Spray is the only thing in the bowl that is airborne, so its
height is divided by GROUND per particle like the spirits'.

**Sizing (2026-09).** The doors moved to (+/-2800, -10100): 500 further north, 800 further
apart, with the nearest strait mouth still 1,600 from either eye and the eyes still inside the
junction rim. Re-run those numbers in the `MAELSTROMS` header comment if either one moves
again, because the straits are placed by bearing from `HUB` and a bay moving moves a mouth.
`STREAM_OUT` came down from 2.6r to 1.95r at the same time: the sea was visibly falling in
from sixteen hundred pixels out, which made an already large thing read larger. The radius
itself is unchanged, so the grip and `MAELSTROM_REACH` are what they were.

## The anchorage, and the way out of it

The water north of the reef. Reached through the arch on the fishing boat, and it holds the
places expeditions is run FROM. Things you moor at, not things you fight.

**Five islands, and the middle three are a row.** The Crew Hall sits at (-900, -4400) with
**The Posting House** 1,250 west of it and **The Forge** 1,520 east, so the hall is flanked
the way the throat is flanked by the Gunwharf and the Charterhouse. What you did on one side,
what you make of it on the other.

- **The Posting House** (`posting_house`) is the expedition side's Tally House: the same
  institution on the other half of the game, one settling trawl orders and one settling
  hunts. Its plate answers the Tally House's building deliberately, same cream plaster and
  dark shingle and warm windows, with a wanted board of curling notices where the harbour
  has its crane and its ledger sheet. Bounties were the last piece of expeditions
  management that was still a tab. Its `href` is NEVER FOLLOWED: mooring pins the board up
  where you float, like the Tally House's orders and the Shipyard's rack, because a route
  would unload the whole chart to show one panel and rebuild it on the way back. The board
  is one component, `BountyBoardModal`, shared by the chart and the hub card, so the plate
  cannot drift between the two surfaces.
- **The Forge** (`forge_isle`) shows the rung you hold. `forgeIsleFor` in SeaMap swaps its
  plate, name and blurb across cold / the Forge / the Abyssal Forge / the Accelerator, off a
  `forgeTier` the sea page reads through the same three `gauntletUpgrades` helpers
  /expeditions reads, so the island and the bench cannot disagree. Same shape as
  `crewHallFor` and `homeFor`, and like both of them the COORDINATES stay in chart.ts because
  that is what `check-islands` measures. Its berth is on the west shore, like the
  Charterhouse's: the channel runs between it and the hall. Its `href` is not followed
  either: mooring lights the bench where you float, through `sea/ShipSheet`.

**The ship screen opens over the water too.** The Gunwharf's second door ("Manage her") and
the Forge island both mount `ShipHero` in the same focus mode `/expeditions/ship` and
`/expeditions/forge` use, inside `sea/ShipSheet` — the shape `ShipyardSheet` set. Both used
to be `router.push`, which unloads the whole chart to show a screen about the ship moored
twenty pixels away and rebuilds it on the way back.

Making that work meant lifting the fetch out of `ShipHeroSection`: a client component cannot
render an async server component, so the query lives in `expeditions/shipHeroData.ts` as one
action. The section awaits it for the routes and the hub; the sheet calls it on every open,
because doubloons, fathoms and repairs owed all move while you sail. `ShipHero` takes an
optional `onBack` for this: on a route the back arrow links to /expeditions, and on the water
that would sail you off the sea to get out of a sheet, so given one it closes instead.

**It is 3,600 across and walled all the way round.** It was 5,200 with an invisible rim, and
both halves of that were wrong: the extra water made it a sea to cross rather than a harbour
to move about, and an edge you slide along without ever being told it is there is not a
shore. `anchorageRocks()` in `SeaMap.tsx` runs the same rock as the reef — two staggered
rows, shingle at four times the density, the same 520 of clearance at the gap — placed by
ANGLE rather than by world stride, because stepping in pixels along a curve bunches the rock
at the ends.

The wall covers about **229°**, not a semicircle: the chord sits 1,500 from a centre 3,600
out, so the anchorage is the major segment. `anchorageArc()` returns the sweep rather than
hardcoding it, because a wall that stops short of the water it encloses leaves a gap that
reads as the way out.

**The Sortie** is that gap, due north, at the exact midpoint of the arc and dead opposite the
arch. So the whole crossing is one straight line: in through the reef, across the harbour,
out the top. The same two headland stacks that frame the arch frame this, inner edges
lapping the mouth by about 10px, same as over there.

It is the one place on the chart where the hull under you changes, so unlike the arch **it
asks first** — the arch is a hole in rock with more harbour behind it, sailed through on the
boat you were already on. Past the sortie you are on the ship the expedition ladder sells,
and the confirm names the hull and counts the crew actually in raid seats, including zero.

### The two islands flanking it

**The Gunwharf** (west, `-898, -5715`, r 340) and **The Charterhouse** (east, `+898`, same
latitude) sit either side of the throat. They are ordinary `PLACES` ports — coastline, shore
foam, a drawn berth, the mooring prompt, a minimap pin, all of it inherited.

They were not. Until 2026-08-30 they were two horizontal jetties on piles, `dock-raids.png`
and `dock-voyages.png`, with their own proximity radius, their own art colliders, their own
waterlines and their own bespoke prompt. They read as furniture floating in the middle of a
harbour: a plank of art laid on the water with nothing underneath it and nothing around it.
Every other destination on this chart is an island, so the two most consequential doors in
the game were the only two that looked like scenery, and people sailed past them.

Their positions are **written down in `PLACES` and checked against the rim** in a
module-load guard under `EXP_EDGE`. `PLACES` is a literal built before `EXP_ORIGIN` exists,
so they cannot be derived there; the guard re-derives them from `ISLAND_ARC` (1,150) and
`ISLAND_SETBACK` (740) and throws if they have drifted more than 2px, and also refuses a
position that leaves under 200px beside the sortie or under 250px to the harbour wall.

| | |
|---|---|
| **The Gunwharf** | Your ship: berthed, armed, taken out from here |
| **The Charterhouse** | The voyage board, opened over the water |

**The Wargate is a well, drawn under the hull.** The first mark was a DOM ellipse lying on the
water, and it read as a disc laid over the ship because a DOM mark paints over the canvas that
draws her. A standing arch was tried next and REJECTED on sight ("it should still just be a
portal on the sea"). It is now the way home's own well (`seaPortalWell`) in gold at the top tier,
created as a twin beside `portalWell` in `SeaIslandsGPU` at `WARGATE`, advanced and
night-tinted with it, and roused through `gpu.wargate(inside)` from the chart's proximity tick.
Under everything that stands on the water, so she sails into it. The DOM `WargateMark` remains
only as the `?gpu=0` fallback. Rule: a portal on this sea is a well in the canvas, never a DOM
mark and never a standing structure.

**The Wargate's sheet.** `WargateSheet` has a header row (title left, close right) sat just
under the nav; it used to open seventy pixels down with nothing in the gap, and on a phone the
column covered the scrim so there was no way out. Its bosses are art-forward tiles in the
campaign Bosses tab's idiom: portrait as cover, the boss's own name (from the raid config) over
a bottom scrim, a check when bested, two to a row, grouped by chapter, unbested ones dimmed and
not tappable. Tapping a bested one opens the same `BossFightModal` with the gate's verb.

**Neither island's `href` is ever followed**, which makes them the only two on the chart
that are handled by id in `enter()`.

The **Gunwharf** opens a two-card chooser (`GunwharfAshore`), because its doors are not the
same kind of thing: *Manage her* is a page (`/expeditions/ship`), and *Switch to expedition
ship* is not a page at all: one tap and `swapHull` changes the hull under you, no confirm.
It used to open a berth sheet (the muster, the mounts, a "Take out your ship?" button), and a
question you have already answered by walking to the dock is not a question; the sheet and
its state were removed in September 2026. The card reads *Switch to fishing boat* when you
are already aboard, and does the same the other way.

The **Charterhouse** opens `DailyVoyagePanel` itself, in a modal over the chart
(`sea/VoyageBoard.tsx`). It routed to `/expeditions` first, which is a hub of six cards one
of which opens this panel — so mooring at the island whose whole purpose is voyages left you
two taps and a page load away from a voyage, on a screen mostly about other things.

It is the **same panel**, imported as-is, not a second implementation: the one thing a second
board must never do is disagree with the hub about what a voyage pays. Its data comes from
`voyageBoard()` (`sea/voyageBoardActions.ts`) **when the modal opens, and on every open** —
a crew roster, the day's voyage state and eight rows of history do not belong on the chart's
own load for a panel most sessions never open, and a board cached from before a send would
offer a route that is already at sea. The panel's `router.refresh()` on send and claim
re-renders `/sea`; the map stays mounted, so the boat keeps her position, heading and fog.

**The Charterhouse's berth is on its WEST shore**, against the chart's south-east default.
Both islands should be moored at from the channel, which is the water anybody is actually
sailing up; a default berth on this one would be round the back, facing the harbour wall.

**Your ship is drawn lying in the Gunwharf's berth** whenever she is not out. Without her the
swap would be a menu state — you would be told she was waiting and have to take it on trust.

**And she sits IN the water there, not on it** (2026-09). The sprite alone read as a sticker:
no dish under her, no rings off her, nothing moving. SeaMap now lays her into the canvas's
wake list every frame as a hull at rest (`gpu.berthed(...)`, next to the helm's own `wake`
call), so the wake module gives her the same trough and slow heavy rings the helm gets, from
the same seat and weight — `shipSeat(tier)` in SeaMap is the one source for both, and must
stay so. On top she rides the bays' `encBob` on her own wrapper (`.sea-berth-bob`), phased off
her position. The `?gpu=0` fallback draws the helm's DOM `.sea-heave-trough` at her keel
instead. Anything that moves `SHIP_BERTH_OFF` moves all of it.

**And she has a reflection**, at the helm and at the berth alike: `WarshipMirror` in SeaMap, a
second `<img>` of the same file flipped about the keel row (`seaKeel`) at the skiff's numbers
(alpha 0.26, kept at 0.55 of its height, sunk 4%), masked to fade with depth, drawn after the
hull so it lies over the drop shadow. The Warship and ShipAtBerth both render it; a hull
drawn anywhere else without it will read as a sticker next to them.

**A REFLECTION LEANS THE OTHER WAY** (`Captain.setHeel`, 2026-09). Mirroring a rotated object
about the waterline gives you the object rotated the other way round: reflect(rotate(h, t)) is
rotate(reflect(h), -t). Both Pixi twins live inside the node the caller rotates, so they were
picking up +t where they needed -t and sitting a full 2t out, leaning WITH the hull instead of
against it. `setHeel(deg)` applies -2t locally so the net is -t; the helm passes `sk.heel` and
the fleet passes each hull's swell roll. It is invisible at a degree of swell and impossible to
miss on a Man-o-War under a maelstrom's pull, which is where it was caught.

The vertical scale is deliberately NOT foreshortened by GROUND: the Pixi captain's twin has
always been 0.55 in screen space, and the DOM mirror matches it. Do not "fix" one without the
other or the two hulls stop agreeing about the same water.

### Sizing it

Any change to `EXP_EDGE` has to clear the Crew Hall, whose shore reaches 2,124 from the
anchorage centre. At 3,600 that leaves about 1,000 of open water past it and still fits
three or four more islands at the `r1 + r2 + 840` separation `check-islands` enforces. The
arch-to-sortie sail is 5,100, which is a leg rather than a voyage.

`SORTIE`, `anchorageArc()` and the minimap's `expeditions` half all derive from `EXP_EDGE`,
so moving it moves them together. `RAID_EDGE` (13,000) does not — that is the open water
beyond, and it is deliberately its own number.

## No ring of light under the hull

A heavy hull sits in a `trough` — a dark dish that multiplies the sea down where she
displaces it — and it used to carry a bright additive `collar` at the waterline as well, on
the reasoning that a hull parts the surface where it sits. It read as a ring of light UNDER
the boat, which made her look like she was hovering over a lamp rather than sitting in
water. The collar is gone; the trough does the job and does it the right way round. **Light
added at the waterline says the water is glowing. Light taken away says the water is deep
there.** The travelling wake rings still use the ring texture — it is only the static rim
that went.

## The campaign's water is open sea

North of the sortie there is nothing drawn that stops a hull. No bay coast, no strait
shoal, no plug of rock across a door, no route of walls through a chapter and no gate: all
of that came out in 2026-09, after four earlier shapes (rings, a chain of basins, a fan of
channels, bays behind straits) each drew the campaign's order a second time in rock. The
water's header comment in `sea/raidWaters.ts` tells that history; read it before adding
anything back.

**The one rule that replaced it: you cannot enter a water you have not earned, and nothing
shows you that.** A bay whose chapter is still shut (`bayOpen` false, i.e. the chapter
before it is not finished) is open sea to look at and a wall to sail into. The frame loop
in SeaMap sets the hull back on the bay's rim with only the inward speed removed, so she
slides along the line, and the helm's hold line says which water and what finishes it
(`bayShutLine`: "The Coffers is shut. Finish A Bigger Fish first."). An open bay has no
rule at all, in or out, from any heading. Not while the guns are out.

What still carries the campaign's shape: the chain itself (a node refuses to open out of
order wherever you float), each bay's own sea colour, and the minimap, which draws the bays
as discs (dim and marked SHUT when unearned) with no straits or bars.

**Five chapters, five seas.** With the rock gone, `Bay.sea` (three stops, deep to pale) is
THE signal that you have crossed into a different chapter, so the palettes are pulled as far
apart as five seas honestly can be: a warm living green for the Loose Thread, a sick jade
murk for the Gullet's water, silted gold for the Coffers, an abyssal near-black for the Last
Fathom, and blood-dark for the coda. They were five blues before, differing only in
brightness, which is a difference you can measure and cannot see. The hue does the work now.

Two things make it land. The shader builds the far-water **haze** from the PALE stop (see
`palette` in SeaIslandsGPU), so a gold chapter gets gold air and a black one black air. And
`BAY_VOTE` (4, against the open ocean's 0.18) lets a bay actually reach its own colour —
the vote was 1, so a sixth of the water was ordinary blue even in the middle of a chapter,
the same mistake the fishing zones carry a note about. The falloff is a sixth power over
900px, so a chapter's colour reaches far enough to see from the junction and then arrives,
rather than washing up over the first third of the bay. `BayBanner` names the water on the
way in; the colour is what you feel before you read it.

**The geometry stays.** Bays are still discs with a bearing and distance, and every ship,
rock, chest and post is still authored in BAY SPACE from `entryOf`; the strait helpers are
coordinate frames now, not doors. `check-islands` still measures placement against the rim
and the isles; its wall and road-walk tests are gone because there is nothing to measure.

## What lives on the expedition side

The fishing half is busy — shoals, gulls, hotspots, bottles, traders, squalls. The
expedition half was empty water with a campaign parked in it. Two populations fill it, both
built the way everything else on this chart is: **derived from a hash of (window, slot), no
rows, no cron, same set for everybody, identical after a reload**, and both pay absolutely
nothing.

**Tempests** (`lib/seaWeather.ts`) are the big weather, north of the sortie only. Four to
seven thousand pixels of radius against a squall's two to four, `power` past 1 where a
squall tops out at it, slower because a thing that size does not scud, and the only weather
on the chart with lightning in it. They share the squalls' 14-minute window on purpose (one
system, one weather) and reuse the `Squall` type, so `seaSqualls.ts` draws them with no new
plumbing. Roughly one per window.

Three things in the renderer scale off `power` rather than being tempest-specific: the
shadow's depth, the rain's fall speed and streak length, and — the one that matters — the
**weighted pick** for the shared drop pool. An even pick put the same number of drops into a
tempest as into a squall a third its area, drawing the biggest weather on the chart as the
thinnest rain on it. The lightning lifts THAT STORM'S SHADOW, never the viewport: a
full-screen flash is a thing done to the player, and it is the exact effect that had to come
out of the gauntlet and the maelstroms for being a strobe.

**Leviathans** (`lib/seaLeviathans.ts` + `sea/seaLeviathans.ts`) are large shapes moving
under the raid water — a whale, a serpent, a ray — four to nine warship-lengths long, seen
only as shadows. They rise, hold, and sound on their own cycles, so most of the time there
is nothing there. Two rules:

- **The layer MULTIPLIES.** The clearest case of the house rule on this chart: a dark sprite
  laid over the sea replaces it, so the surface would stop dead inside the silhouette.
  Multiplied, the water goes on running across its back, and that is the whole illusion.
  It multiplies by a cold blue-grey rather than black, because black is a hole.
- **No hard edge anywhere.** Heavy blur, never full alpha, and it swells slightly as it
  rises. A shape you can trace is a thing at the surface.

**They are scenery and they stay scenery.** No drop, no bonus, no server involvement. The
moment a shadow is worth something the water becomes a spawn timer and a captain crossing to
a raid starts steering by a number instead of looking at the sea; the fishing half already
owns "this patch pays differently" (hotspots), sized against a server that takes position on
trust, and a second one out here would double that exposure to buy an effect that works
better for free.

**The counts are arithmetic, not taste.** Simulating the real run from the sortie out to
each bay, three shapes over the full disc put a shadow on one crossing in six — which is not
rare, it is never, especially as a crossing is only about half a minute at speed. Eight, in
the ring people actually sail (the outer third is the back of the furthest bay and nobody
crosses it), lands at **37% of crossings**. Re-run that simulation before changing either
number.

## A node is not on the water until the chain reaches it

The campaign reveals itself one stop at a time. A fresh bay is open sea with a single thing
in it; a finished one is scattered with everything you did. That progression IS the chapter,
and it does the job the rock used to do before the water was opened up.

`shown(id)` in SeaMap is the one answer, and **five things read it or the change is broken**:

1. **The marks** — ships, chests and posts (`EncounterField`).
2. **The isles under them** — a chest sits on a rock, and leaving the rock behind would draw
   a map of the chapter in stone, which is the thing hiding the marks is for. `isleShown`
   maps rock to node; a rock carrying nothing is scenery and stays.
3. **Collision.** `RAID_ISLES` are in `OBSTACLES`, built once at module load. Hide the rock
   without touching that and you leave an **invisible wall in open sea**. Campaign isles
   carry an `isle` id on their Obstacle and the `nearObs` rebuild drops the ones not drawn.
4. **Proximity.** `encounterNear` / `cacheNear` / `beatNear` are pure geometry and know
   nothing about the chain, so without a filter the helm offers you a boss that isn't drawn.
5. **The minimap**, or the chart hands back the layout the water is withholding.

`previewWhenLocked` is honoured — that flag exists for nodes whose whole job is to be a
visible goal. In practice the three that carry it are all in the coda's bay, which is shut,
so **a brand-new captain sees exactly one thing on reachable water**: the Loose Thread's
intro. Verified by simulation, along with: every one of the 54 placed nodes does become
visible, and the chain never stalls.

**It opens on the same frame, not after a refetch.** `router.refresh()` is still the truth,
but it is a round trip against a page that fetches half the ocean, so the chart runs the
resolver itself: `computeRaidMap`, the same function the server calls, with the same inputs
(hence `navLevel` / `doubloonsNow` / `ancientsCaught` as props) plus whatever this session
has cleared. Identical by construction rather than by agreement. Three paths feed it —
`SeaNodeSheet` and `SeaStory` report through `onCleared`, and a fight reports on the
enemy's `sink` event, which RaidCombat bangs once on the victory beat *after* the
multi-phase branch returns, so it can never claim a kill that did not happen.

**The arrival** (`NodeReveal`) is driven off the STATUS CHANGING rather than off whatever
changed it, so it fires however a node came open and no clear path has to remember to
announce itself. The first pass is seeded and never played, or everything you already own
would rise out of the sea at once on load. It happens where the thing IS rather than as a
banner: a chapter is twenty small openings, and twenty full-screen announcements is not a
chapter, it is an interruption.

## Every campaign stop can be finished from the deck

**55 of the 64 nodes in `RAID_MAP` are placed on the water.** The other nine are the
challenge variants, which are a difficulty switch on a boss you already have rather than a
stop on the road — the boss card carries them (see `BossCardSheet`).

**And every placed one can be SETTLED out there**, which is a different claim and was not
true until 2026-09. Fifteen stops were laid on the chart with nothing behind them: you
sailed up to the Wax Cipher and got its name, its flavour and a close button. Six puzzles,
two throws of the bones, two musters, two sets of refit terms, the Harbor Gate, the
Cartographer's choice and Finn's spoils — at least one per chapter, so sailing the campaign
meant being bounced back to `/expeditions` two or three times a chapter.

`SeaNodeSheet` draws them all now:

| kind | body |
|---|---|
| `milestone` | the toll (`claimMilestoneNode`) |
| `choice` | the Quartermaster's cache |
| `classPick` | the Captain's Choice |
| `puzzle` | one of the five boards, then the reveal (`solvePuzzleNode`) |
| `dice` | `DiceRollNode` |
| `dpsCheck` | `DpsCheckNode` |
| `event` | the choice cards (`pickRaidEventChoice`) |
| `muster` | the manifest checklist + Stand (`standForMuster`) |
| `berth` / `armory` | the terms (`markStoryNodeRead`); the till stays in Manage Ship |
| `spoils` | `SpoilsBoard` |

**None of it is a second implementation.** Every interaction is the component the campaign
map already mounts, given the same props and the same server actions; what is written in
`SeaNodeSheet` is the SHELL, which is the only part that should ever differ between a page
of cards and a panel over open water. They are `dynamic()` — a captain opens ONE of these
at a stop and most stops are none of them.

**The muster is the one deliberate divergence.** The map plays its read-off as a cutscene,
the crew ticking the manifest off aloud. Out here it is the checklist and the verb, because
that is what a captain standing off Muster Bank needs. `musterReport` is pure and is the
same function `standForMuster` re-runs, so a green row can never become a refusal on the
press.

**`nodeSheet()` reads through `getRaidMapView`** — the same load `/expeditions` makes. It
was a three-column select of its own, which was right while the water could finish three
things and is exactly how two surfaces start disagreeing about whether you passed an
inspection.

**`check-islands` fails if any rock on the water has no body that can settle it.** All
fifteen shipped broken and nothing said a word, because every one of them type-checks and
renders. Add a new node kind to `raidMap` and the check fails until the sheet learns it.

## The three celebrations, and the beat that was forfeiting its payoff

- **`scout_debt` was destroying its own reward.** It is a story node carrying a `payoff`
  (mercy at an earlier fork pays back in coin and Nav XP) and its action is
  `claimScoutDebt`. `SeaStory` called `markStoryNodeRead` for every story node alike, which
  marks it cleared and grants nothing — and the claim is idempotent on an already-cleared
  node, so reading it from the deck did not defer the payoff, it destroyed it. **Any story
  node with a `payoff` must be claimed, not read.**
- **The legendary reveal** was being dropped on the floor: a gate beat adds its crew to the
  recruit pool as you read it and the reveal is the whole reason the beat is staged.
  `SeaStory` announces `legendary-unlocked` on the window (it unmounts on the read) under
  the same event name `/expeditions` uses.
- **The chapter parchment and the Quartermaster's plans** lived inside `RaidsSection`, a
  3,500-line campaign map, so the only surface that could fire them was that map — and the
  last node of a chapter is a boss you fight from the deck. Both are in
  `expeditions/UnlockOverlays.tsx` now and fire from the chart off `liveStatus`, so they
  land when the guns stop rather than on the next page load. Both surfaces read and write
  the SAME two profile columns, so a parchment dismissed on either stays dismissed on both.

## The campaign's water has fog now

**Two fog grids, and they must stay two.** `lib/seaExplore` covers the fishing sea; its
origin is the reef and it runs SOUTH, so `fogIndex` returns -1 for every point north of it
— which is why the campaign had no fog at all until 2026-09. `lib/seaExploreExp` is the
campaign's own grid on its own column (`profiles.sea_explored_exp`).

**Do NOT "fix" this by extending the fishing grid north.** A cell's index is `cy * W + cx`
from the origin, so moving the origin shifts every bit already stored, and every captain's
fishing chart would decode as somebody else's. The only way out would be a migration over
every profile row to re-index a mask about fog.

- The campaign grid is measured off `BAYS` and `HUB` themselves, so a re-laid chapter
  cannot fall outside it. It runs down to the **reef** with the anchorage cut out of it, so
  the fog's southern edge is the harbour's own curve rather than a straight line ruled
  across the world. Three kinds of cell are never fogged (`FREE` in seaExploreExp): the
  anchorage, the fishing sea south of the reef, and anything past `RAID_EDGE`.
- **On the chart**: `seaFog.ts`, **a Pixi layer on the sea's own canvas**, last in the world
  container so it covers the water, the islands and the towns on them. Two parts — a BANK
  (the mask as a 53×32 texture stretched across the campaign; the GPU's bilinear filter is
  what makes the front soft) and a BOIL (sixty drifting puffs on the frontier, because a fog
  edge that holds still is a stencil). It takes the night tint like everything else there.
  `ChartFog` in SeaMap is the `?gpu=0` fallback only.
- **The chart's loop owns the EASING**, not the look: one float per cell walking toward the
  mask over about a second, handed to the layer as an array. A 700px cell switching off in
  one frame is a slab disappearing, which is what "it skips as it clears" was.
- **On the minimap**: one pass laid OVER the bays and their ships, so a chapter you have not
  sailed is covered along with everything in it, without any draw above it having to ask.
  **This reverses an older note** that said the bays must never be fogged. That was right
  about the route and wrong about the water — the way home, the harbour, the gate, the
  maelstroms and the next stop are all still drawn over the top of the fog.
- **Fog hides TERRAIN; `shown()` hides MARKS.** Two mechanisms, two subjects, no overlap.
  Everything the campaign has not reached is already absent from the document, so there is
  nothing under the fog to cover. What survives both is your NEXT stop, and that is correct:
  it is the one mark whose entire job is to say which way to go.

### What is on the canvas, and what is not

**On the Pixi canvas** — the water, the swell, islands and the towns on them, shoals, surf,
drift, wakes, splashes, gunsmoke, ability FX, clouds, squalls, maelstroms, lanterns, berth
rings, portal wells and the Wargate, every hull but the player's, **the fog** (`seaFog`),
**hotspots and dig hints** (`seaGlow`), and **the heading chevrons and the portal beam**
(`seaGuideFx`).

**Still DOM, and correctly so** — name plates, water banners, the helm pill, quest glyphs
and ticks, and every panel. Text and signage want to stay crisp and selectable.

**Still DOM and arguably shouldn't be** — the floating bottle and the moored fishing boat
(static sprites), and the chest/post sprites on campaign rocks. Low value: they do not
animate beyond a bob, and the marks are already gated out of the document by `shown()`.

**Deliberately left in CSS** — the warship's heave rings (`.sea-heave-*`). They are pinned
to the hull in SCREEN space, so they never move relative to the viewport; four elements on
pure-compositor keyframes with no per-frame JS is genuinely cheaper than a Pixi layer that
would have to track the hull's offset every frame to draw the same picture. The one thing it
costs is compositing with the swell rather than over it.

### The rule this settled

**Anything that is a VISUAL on the water belongs on the Pixi canvas.** Weather, wells,
wakes, surf, splashes, gunsmoke, fog. The DOM world layer is for what is genuinely
DOM-shaped: labels, name plates, buttons and signage that has to stay crisp and selectable.

A DOM element cannot be argued for on the grounds that it sits above the canvas and can
therefore paint over marks the canvas cannot reach. That argument was made for the fog and
it was wrong twice: the marks in question are already hidden by `shown()`, and hiding a
thing is the correct answer anyway — a rock you have not found should not be in the document
at all. **If a visual seems to need the DOM so it can cover something, the something is what
needs fixing.**
- **It never takes anything away.** An empty mask is seeded from cleared encounters before
  the first frame, and **the seed is queued into `xfogPending`** — without that, the first
  flush would write one cell, stop the column being null, and put every conquered chapter
  back under fog on the next load.

## /expeditions is retired: this is the only door

**The hub page is a redirect to `/sea`** (2026-09-09), and so are `/expeditions/ship`,
`/forge` and `/items`. The Expeditions tab is off the Nav. Every tile that page held is a
place on this chart — see [expeditions-hub.md](expeditions-hub.md) for the full mapping and
for what survived the deletion.

**The `expeditions/` DIRECTORY stays.** The sea imports twenty-odd modules from it, because
the water reaches the hub's own components rather than reimplementing them — that is why
the two never drifted, and it is why the folder outlived the page.

Three things this cost, all of them repaired:

- **Thirteen raid exits** pointed at the hub — both gauntlets, the practice skirmish, the
  Ghost, the two Sunken Hand gates, and `RaidGame`'s generic leave when no `onLeave` is
  passed. They land on the water now.
- **`BountyRungUnlock`** announced a new bounty rung on the hub's page load and had nowhere
  left to fire. It rides the bounty poll the chart already runs, at the two moments the
  answer can change (crossing into the anchorage, and closing the Posting House).
- **The chart's island `href`s** now name `/sea` itself. They were the honest answer to
  "where does this go if anything falls through", and naming a redirect back here would
  have been a round trip to the water you are floating on.

## How the sea teaches: two tours, then cues

**The tour teaches what you cannot sail without. Everything else is delivered where it is
usable.** That rule lives at the top of `SeaLandfallHint` and is the oldest one here; both
tours had drifted a long way off it (24 and 16 beats) before being pulled back to **10 and
5** in 2026-09.

- **`FIRST_VOYAGE` (11)** — steer, sail south, cast, catch, the hold, XP, sail home, go
  ashore, sell, **the pennant**, and a closing line. Every beat is something the captain is
  *doing*, bar one.
- **`GATE_TOUR` (6)** — past the reef, the Gunwharf, the gate, what is beyond it, **the
  pennant**, go. The Gunwharf is the one island it names, because nothing up there happens
  without the warship.
- **THE PENNANT IS THE EXCEPTION, in both tours and on purpose.** Every other disc is a
  place you go when you already know you want it; the pennant is the one you press when you
  do NOT know what to do, and out past the gate it is the whole of the progression. It was a
  cue for a day, fired on Finn finishing a job — hours after the question first comes up. A
  signpost that arrives once you are lost is not a signpost.
- **`SeaLandfallHint`** — one line the first time you tie up at a port. All seven anchorage
  islands live here, plus the Shipyard, Trawl Docks and Homestead.
- **`SeaCue`** — one line the first time anything else becomes true: a rank gained lights the
  spine disc, four fish brings up the almanac, 7,000px out brings up the chart, a boat in
  reach explains hailing, an island flying a gold mark explains gold marks, the Wargate
  explains itself in range.

**Adding teaching?** Ask whether a captain can act on it *right now*. If not, it is a cue or
a landfall hint, not a beat. The failure mode this prevents is ten screens about places you
have no ship, no crew and no campaign for.

**Cues queue and never talk over a tour.** Crossing into the anchorage makes three true at
once. They are latched in `sea_hints_seen` under a `cue:` prefix — same column as the port
hints, no migration, no way to collide with a port id.

## Neither of the hub's teaching surfaces comes out here

**Captain's Orders was built onto the campaign panel and REMOVED the same day** (2026-09-09,
by request): *"unnecessary now that we have the quest/campaign guide"*. It is a written-down
decision rather than a thing nobody got to, so do not re-propose it.

The reasoning is that the water already teaches by pointing. A checklist card is what you
need when the next thing to do is buried in a page of tiles; out here **the `?` hangs over
the one stop the chain wants, cleared stops wear a green tick, the compass carries the next
stop as its top mark, a chevron heading is laid on the water after every clear, and the
island holding something for you floats a `!`**. That is the same job done in the language
of the place rather than in a card laid over it — and a captain following a mark on the sea
has learned where things are, which a captain following a card has not.

**The `/expeditions` tour is not ported either**, for the plainer reason: it teaches that
page's layout, and that layout is not out here.

`CaptainsOrders` still runs on `/expeditions`, which is where it was built for and where
none of the above exists.

**Finding it** is the compass, which takes the next stop as its highest-priority mark —
ahead of even a finished job of Finn's. That is not a flourish: the water deliberately hides
what you have not reached, so in a fresh bay there is no rock, no road and no coast to read,
and without the arrow the answer to "where do I go" is a search pattern.

## The campaign in the corner

**One disc holds the corner on both halves of the game.** `journey` is FIRST in the HUD row,
a pennant on a staff, and the SIDE decides what is behind it: the Salt Road in the fishing
grounds, `SeaCampaignPanel` out past the reef. They were two discs with two icons in two
corners, which said they were two different kinds of thing. They are not — they are the same
role, *this is your story and here is where it has got to*, told about the two halves — so a
captain learns one mark and it means the same thing wherever they are sailing. It is first
because on a row read left to right, the door you consult most often should not be third.

It was a card at first, carrying the chapter, the next stop, a verb and a bearing. That is
more than this row's job: the row is doors, one glyph each, and a panel three times the
height of its neighbours reads as an alert rather than as a fixture. What it knows is in its
**dot** — the same amber one the crew disc uses, lit for a stop waiting on one side and for
Finn holding your pay on the other — and its **tooltip**, which names the chapter and the
errand. Only a finished job of Finn's blinks; the HUD is otherwise completely still, so the
one thing that moves has to mean one thing.

**`SeaCampaignPanel` is a READ, not a hub.** Chapter rows that expand to a spine of stops,
the one you are on lit and carrying its art and its line of voice. Two rules:

- **It keeps the water's secrets.** The sea hides every node the chain has not reached, and
  a list that spelled the chapter out would hand all of that back in one tap. It names what
  you have done and what you are on, then says *"N more, still dark"*. **A chapter you have
  not reached has no name**: not its art, not its subtitle, and not its title either — the
  titles ARE the story, and four rows reading *A Bigger Fish*, *The Coffers*, *The Last
  Fathom* are a contents page for a book whose whole shape is that you do not know how long
  it is. The row shows its numeral, *Still dark*, and a padlock. It is not a button either:
  a locked row that opens to tell you how many stops it is hiding has still told you how big
  it is. The numeral stays because knowing there is a Chapter II is the reason to keep
  sailing, and the coda has no numeral by design, so the last row gives nothing away at all.
- **It never lets you act.** /expeditions has the interactive version; entering a raid from a
  list here would put the page of cards back on top of the ocean that replaced it. Every stop
  is somewhere on the water, and the panel says so at the foot: *sail to it*.

**It is art-forward, and it is ONE SIZE.** A chapter row is a banner of the place that
chapter ends, taken from `RAID_BOSS_BG[raidId] ?? RAID_LOCATION_BG[raidId]` on its last
non-side-branch raid, with a scrim weighted to the foot; the blurb sits UNDER the art rather
than on it, because a line of italic over a painting is the one thing that always reads
badly. A chapter you have not started is drawn dark and unlit, which is the same rule as its
hidden subtitle. Inside a spine, every combat stop carries its enemy's portrait off
`getRaidConfigById(raidId)` at a size you can read a face at, so the bosses are the spine and
the story beats between them stay type.

The panel's height is FIXED (`min(80vh, 680px)`) and the list scrolls inside it. Sized to its
content it grew and shrank on every tap, which drags the close button and half the chapters
to a new place mid-read and makes the panel feel like it is arguing with you. The scrolling
child needs `minHeight: 0` or it grows to its content and pushes the box open anyway, which
is the exact failure the fixed height exists to prevent.

## The way home is one per BOSS

**Beating a raid opens a way back beside the hull you beat it on.** It used to be one per BAY,
opened by that chapter's last raid — a rule that read well and played badly. Barnacle Pete is
6,800px up the Loose Thread and the chapter's portal sat at 1,200, opened by Krust, so a
captain who had just beaten Pete (and now had every reason to fight him again for his crate)
sailed the whole road back and the whole road out on every run. A portal is a reward for
finishing a chapter; the thing that actually needs a road home is a boss you are FARMING.

- **`RETURN_PORTALS` is derived from the raids**, so a boss cannot ship without a way home and
  a way home cannot outlive its boss. Skirmishes are excluded (the practice fight is not
  farmed) and challenge variants share their boss's, being the same hull.
- **Still earned, still one-way.** Nothing appears until you have sunk that particular hull,
  and out is sailed every time including on a re-farm — the voyage out is the part with the
  water in it.
- **The portal LOOKS for its water.** One fixed offset was tried twice and cannot work: off
  her starboard bow put the coda's mouth inside its own rock, due east put Krust's inside
  thread-watch. The bays are laid differently on purpose. `findPortals` sweeps out from due
  east (away from the mooring, which is off her port quarter) over three radii, taking the
  first spot inside the bay, clear of every rock in it, and `PORTAL_REACH + ENCOUNTER_REACH`
  from any mooring. Deterministic, computed once, and it moves when a bay is re-laid.
- **`check-islands` proves all nine**, including the gap to their own moorings.
- **Taking one is a PASSAGE, not a teleport.** All three doors — the homestead portal, the
  ways home and the Wargate — go through `jumpTo`: the light swallows her, the move happens at
  the SEAM under it (`warpTo` at `WARP_MS`, half a second under and half a second out), and the
  sixteen motes run their path backwards on the far side so whatever took her is visibly what
  puts her down. The ways home and the gate used to call `warpTo` on its own and the boat
  simply appeared somewhere else, which is the one moment on this chart where a captain does
  not believe they have travelled. The well itself winds up while you float in it
  (`gpu.home(i)`), indexed off the same filtered list `gpuHomes` builds from.
- **And she comes UP.** The going was a whole event and the arriving was a boat that was simply
  there when the light cleared — half a passage. Three beats at the destination, all borrowed
  from what this sea already draws: `summon` (light rising under the hull), then `splash` at
  +110ms (the water giving), then `gunshock` at +190ms (the swell running out from where she
  broke it). The timers are ref'd and cleared, so a passage cut short never fires them into
  water the captain has left.

**And the landing check was testing the old design.** It measured `PORTAL_HOME` against the
HARBOUR and had been failing for months, correctly reporting a rule that had stopped being the
rule: the way home lands at the WARGATE'S FEET now, out in the junction, 3,950 from the
harbour's centre against its 3,600 rim. It checks what has to be true instead — inside the
hub's disc, outside the gate's own reach (arriving in a portal opens its sheet), clear of every
berth.

## The way on, drawn on the sea

**When a clear opens something, a short run of gold chevrons is laid on the water** from
where you stand toward the new stop (`NextHeading`), runs outward for seven seconds and goes.

The compass answers *which way* and answers it forever, quietly, in a corner, at the edge of
a screen full of moving water. That is right for finding a buyer you were already looking
for and wrong for the one beat where the sea has just CHANGED and you do not know it yet:
you clear a post, a hull you have never seen appears eight thousand pixels away, and nothing
on the water says which way to put the helm over. This is the answer at the moment the
question exists, in the middle of the screen, where you are already looking.

- **It leaves.** A permanent line from the boat to the objective is a quest arrow, and a sea
  with one is a corridor — you stop reading the water and follow a rail.
- **It waits for the guns.** A raid clears at the KILL, which is several seconds of sinking,
  loot and a summary before the chart is a chart again. The clear works the heading out and
  stashes it; a second effect lays it down the moment `fightOn` drops, or the line would
  spend its whole life behind a card.
- **Nothing for something you can already see** (under 1,600px), and nothing on load — only a
  clear this session moves the counter, so arriving in a bay with three things open draws
  nothing.
- **The angle is a SCREEN angle**, `atan2(uy * GROUND, ux)`. Every mark counter-squashes
  itself like everything else standing on this water and then turns by the bearing your eye
  actually sees; turning by the world bearing points the arrows somewhere else.

**Every mark that says "here" is one object** (`QuestMark`): a dark translucent disc with a
light stroke drawn on it, in gold for a bang (a job to take) and a query (one to hand back),
in green for the tick. The campaign's was a solid gold coin with a black `?` punched through
it and Finn's was a 45px Cinzel glyph under five stacked text-shadows — two different objects,
and neither belonged to a painted chart: a filled disc with knocked-out type is a UI badge and
reads as a sticker on a painting. `AshoreTick` had the right construction all along, so this
is that object in three states. Done and to-do are the same lamp in two colours, not two
languages.

## A toll is settled where it was demanded

**A scene that leads to a transaction holds until the transaction is made**
(`StoryScene`'s `ctaSlot`, used by `SeaStory`). The Bilge Eels name their thousand doubloons
in the cutscene, the cutscene ended, and a panel then opened over the sea asking for the same
thousand: the deal struck twice, once in the film and once in a form. The stage, the backdrop,
the letterbox and the two thugs standing there are exactly the context that makes a price mean
something, and dropping all of it to ask the question in a box throws that away at the moment
it was about to pay off. So the terms appear in the plate the speaker was just talking from,
in place of the closing CTA.

Details that matter if this is reused:

- **Keyed off `intro`, never `cleared`.** A milestone's scene is always an intro, and the
  caller passes `cleared` alongside it purely to suppress the read-write — the payment clears
  the node, not the watching. The chart only opens an intro for a node that is not settled
  (`openNode`), so an intro on a milestone is a toll still owed.
- **`SeaMap` opens no sheet afterwards** for a milestone. Everything else still hands over to
  `SeaNodeSheet`, which keeps its own `Toll` for the second visit — `seenIntros` sends a
  captain who has already watched the film straight to the plain sheet.
- **The slot owns its own way out.** A first watch has no Skip, so without a *Keep your purse
  shut* button a captain short of the toll would be standing in a cutscene with one dead
  button. Walking away writes nothing.
- **Gold, not the scene accent.** Everything else in the scene takes `sceneAccent`; money is
  gold on every other surface in the game.

## The header's height is one number

`--nav-h` (44px, 48px from 640px up) in `globals.css`, and everything that starts underneath
the header reads it: the nav's own spacer, the nav itself, `.sea-surface`,
`.raid-oversea-stage`, `.raid-oversea-bar` (`+18`, the HUD line) and the four full-screen
sheets that sit in the chart's box (`top-[var(--nav-h)]`).

It was written out by hand in every one of those, and the desktop copies said **60** while the
nav said **64** — invisible while the nav was the taller of the two. Compacting the nav to 48
turned that four-pixel disagreement into a thirteen-pixel BAND: a black strip below the
header's own border line and above the water, on the game's main screen, which read as the
header still being tall. The nav is also given the height explicitly now rather than being
left to add up from its padding and whatever the tallest thing in the row happens to be (a
36px mail bell held it at 53 once already). Change the number here and the shell moves
together.

## An island says what is finished on it

**Every island that can hold something for you carries the call** (`PlaceIsland`'s `call`): a
gold **"!"** floating above the island plus a line of plain words above the name. It existed
already and only the Trawl Harbour ever used it, with "2 crew back" hardcoded around a number.

**The mark is `QuestMark kind="offer"`**, the same disc the campaign's next stop and Finn's
jobs hang over their marks — and the bang rather than the query on purpose. The genre's own
split is exactly right here: **"?" is a thing you go and finish, "!" is a thing being held out
to you**, and every island call is the second kind. The campaign keeps the "?" so the two
never mean the same thing. It is sized off the island's radius (`clamp 40..72` at `r * 0.24`)
because these run from a 210px isle to a 500px one, and counter-squashed like the name plate:
a sign stands up off the plane, it does not lie on it.

**It was a warm radial bloom three island-widths across and that was wrong.** A soft gold wash
the size of the whole place reads as weather, not signage — at chart zoom it is a large vague
brightness you have to interpret, and it swallowed the island's own art and the water round it
to say one small thing. Do not put it back.

- Trawl Harbour: `N crew back` · Tally House: `Orders ready` · Crew Hall: `Training done`
- Charterhouse: `Voyage in` · Posting House: `Bounty paid out`

**The Crew Hall's call is a FINISHED BUNK, not a waiting recruit**, and it was the second
for a while. That was wrong twice: the recruit board is in the crew PANEL, which is a disc,
so the mark sent you to an island that could not settle it — and the board rolls three faces
every morning, so it was lit nearly all day, every day. A mark that is always on is
decoration. A finished stint happened at the hall, is collected at the hall, and goes out
the moment you take it. Its sheet re-polls on close for exactly that reason.

**Each names its OWN errand**, because those are five different journeys a thousand pixels
apart and a shared badge is a light with no address. That is also why `crewHub`'s one "recruits
or a voyage" boolean was split: the two are settled at two different islands, so one mark over
both would send you to the wrong one half the time.

**Polled on crossing and on closing, never on a timer.** Bounties tick over while you are out
on the water — you clear a depth, land a fish, sink a hull — so the read happens when you enter
the anchorage and again when the board shuts, which are the two moments the answer can have
changed. A dot that costs a round trip every few seconds is a dot not worth having.

## The settings disc

**Top right, alone, away from the run of discs down the left.** Those are places you are going;
this is the knobs on the outside of the game, and putting it at the end of that run would say
it was another destination. Switches, not sliders: every one turns something OFF that is on by
default, which is why there is no "restore defaults".

`music`, `sfx` and `biteTimer` are `lib/seaSettings` keys — **localStorage, deliberately**, and
the one exception to the house rule that anything one-time lives in a profile column. Those
flags are true of a DEVICE, not a player: turning the music off on a train must not silence the
speakers at home.

**Two things moved here off the profile page: the audio session and signing out.** Both sat
under a heading called Settings, two taps and a route away from the disc labelled Settings — a
player looking for the sound controls opens the sound controls. *Let other apps play music* is
held by the panel itself rather than added to `seaSettings`, because it lives in
`lib/audioSession` (two audio modules read it at their own entry points) and it is the only
inverted one here: ON means the game goes quiet. Flipping it on also actively releases the
session keepers, or the player's podcast would not come back until they left the page. Signing
out is last, ruled off, and wears none of the panel's colour.

**There is no clock in the corner.** There was a disc up there reading out the phase, and it
was the only glyph in the row that answered a question nobody asks: the sky already says what
time it is, in colour, across the whole screen. `seaClock` still runs everything it ran
before (the tint, the runners, the hotspots); it simply is not narrated.
"Next" is the same rule the Expeditions hub lights its spine with, the first node in chain
order that is `available` and not a side branch, resolved against the water through
`ENCOUNTERS`, `BEATS` and `CACHES` for a position (`nextStop`). Tapping the card opens the
chart, where the same node is pinned as a gold ring labelled NEXT (Minimap's `next` prop),
so the corner and the chart can never point at different things. The card hides while the
rod or the guns are out, and when nothing is waiting.

## The shoals

**There are fish in the water now** (`sea/seaShoals.ts`). Dark shapes under the surface,
moving in schools of 13, thicker where the fishing is better, and they bolt when a hook
lands among them.

It exists because the two halves of the game never met: fishing was a dial that appeared
over the sea, and the sea underneath was empty. You sailed to coordinates because the UI
told you to, not because you could see anything there.

**Density is the mechanic made visible, and it changes nothing.** Every payout, rarity roll
and hotspot effect stays exactly where it is, server-side. What changes is that "the Deep is
better" and "there is a shoal over there" stop being sentences.

| Water | Fish drawn, of a school of 13 |
|---|---|
| The Shallows | 5 |
| Open Waters | 6 |
| The Deep | 7 |
| The Abyss / The Ancient Deep | 9 |
| Inside a **shoal** hotspot | 13, from about 1.5 radii in |

Only a `shoal` hotspot pulls fish. A trench and a flotsam patch do other things, and drawing
fish over them would say the wrong thing about what they are.

**Density is spent on COUNT before brightness**, and the slot span is 1.6 rather than 1. At
1 the count saturated by the Deep, so the Abyss, the Ancient Deep and a hotspot were all
thirteen fish differing only in alpha, which is the one thing this is meant to make visible.
Size reads the BAND and is clamped: a patch may summon more fish and may never grow them.

They are **first into the world container**, so everything else is above them: the drift
foam, the wake, the islands, every hull. They take the night tint harder than the surface
does, and they are dim on purpose. A fish seen through water is a suggestion of a fish; the
moment they read as crisp sprites they read as floating ON it.

**The scatter is the point.** `gpu.scatter(x, y)` fires from `startFishing`, and sailing
across the chart to a patch and watching it empty is most of the reason to have drawn them.

## Weather

**Squalls you SAIL INTO, not weather that happens to you** (`lib/seaWeather.ts`, drawn by
`sea/seaSqualls.ts`). That distinction is the house rule made concrete: a storm on a timer
is an event you caught or missed, and nothing in this game does that to anybody. A squall is
a PLACE. It is somewhere on the chart, it is drifting, and it is yours to steer into or
around exactly like a hotspot or an island.

**Derived, never stored** — a hash of (window, slot), same as the traders, the bottles and
the hotspots. The window is **14 minutes**, deliberately not the hotspots' ten or the
bottles' eleven: two systems refreshing on the same beat make the whole sea blink at once.

**It changes the weather and NOTHING else.** No payout, no bite rate, no rarity roll, no
crate chance. That is a decision, not an omission: the hotspots already own "this water pays
differently", they are sized against a server that takes the player's position on trust, and
a second multiplier on weather would double that exposure and make a squall something you
have to chase. If weather should ever pay, that belongs next to `hotspotEffect` with its own
numbers.

| | |
|---|---|
| Windows with weather somewhere | 82% |
| Squalls at once | 1.19 mean, 2 max |
| Radius | 2,200 to 4,100 world px (about 10s to cross) |
| Drift | 1.5 to 4.5 px/s, so 1,200 to 3,800 px in a window |

**Three layers, and the order is the illusion.** The cloud shadow lies ON the water, squashed
by `GROUND` like every flat thing here, and it MULTIPLIES rather than washing grey — a wash
flattens the palette under it and every band starts looking like the same slate. The rain
falls THROUGH the air above, so it takes no squash at all; a rain streak with the plane's
foreshortening would be lying down on the water. And each drop leaves a dimple where it
lands, back on the plane and squashed again, which is the difference between a screen effect
and rain hitting something.

The rain layer is a **sibling of the world** taking its transform, like the gulls, so a
late-baking island cannot end up in front of it.

**And the sea gets heavier**, which is the half you feel: a longer, slower heave on top of
the chop and a slow roll on top of the drive's heel, eased in over a couple of seconds so
sailing into weather is the sea building rather than a switch. `rough` is a ref, because
re-rendering the chart to record that the sea is slightly heavier would undo the loop.

## Night

**The day/night cycle is a TINT, and a tint cannot light anything.** Every sprite is
multiplied toward a cold blue as the hour turns, which says the sun has gone and says
nothing about night. What makes night night is that a few things start EMITTING while
everything else stops. `sea/seaLights.ts`, and each of the three answers a different
question:

| | | |
|---|---|---|
| **Your lantern** | a warm pool travelling under the hull | *can I see* |
| **Every other boat** | a smaller lamp on each trader, regular and friend | *is anyone about* |
| **The deep** | cold specks, Abyss 0.6 and Ancient Deep 1.0 | *where am I* |

**These take the darkness itself, not the night tint.** Everything else on the canvas is
multiplied toward the hour; these get BRIGHTER as it deepens. That inversion is the whole
feature.

**Additive, and flat on the plane.** Light adds, it does not cover: a pool painted over the
sea would hide the swell inside it, which is the opposite of what a lamp does to water, and
it is the same reasoning the berths' harbour lights already carry. Every pool is squashed by
`GROUND` like the berth rings and the island shadows, because it is a shape the water makes.

**The lantern is on the STAGE, the rest is in the WORLD.** The camera follows the hull, so
relative to the screen she never moves and only the sea does; her lamp is a fixed point.
Everyone else's has a world position the camera does not follow.

**Lamps come from the same `fleet` list the hulls are drawn from**, off each boat's `cx`/`cy`,
so a light can never burn where there is nobody.

**It costs one visibility test by day.** Everything multiplies by darkness and the whole
layer is skipped under 0.02. About half of a real day has some darkness in it, so this is
seen often rather than being a rare treat.

## The gulls

**Birds working over a patch** (`sea/seaGulls.ts`), which is the half of "you can see the
fish" that works at a distance. The shoals are dim on purpose and only read up close; a
hotspot needs to be something you can decide to sail to from most of a screen away, and the
only thing announcing one was a badge that appears once you are already in it.

**Over a shoal and a flotsam patch, never a trench, and the omission is the information.**
Those two are surface things: fish near the top, and scraps floating on it. A trench is the
one that is about depth. So the chart quietly teaches the most useful rule it has, which is
that birds mean fish near the surface. Checked against the real generator rather than the
filter: every window holds exactly one of each kind, so there are always birds somewhere and
the trench never has any.

**They are in the AIR, which the projection has to be told.** Altitude is divided by `GROUND`
before it is applied, the same counter-squash every label and standing building uses, so a
bird 80px up is 80 SCREEN px up. Each drops a shadow on the water directly below it, and
that shadow is the entire reason the altitude reads: without it a gull is a bird-shaped mark
lying on the sea. Higher is a fainter, wider shadow, which is the only cue for how high.

**The layer is a SIBLING of the world container, not a child**, given the world's transform
each frame in `camera()`. Islands bake asynchronously and add themselves to the world long
after init, so anything added in the world at init would end up behind a headland that
finished baking a second later. Birds are above everything by definition, and copying two
numbers a frame beats sorting the world container forever.

## How the minimap is read

**Shape carries the meaning; colour only reinforces it.** Everything on the chart used to be
a circle in gold or green, so a harbour, an isle, a buyer, another captain and a dig site
were five dots in two colours and the key was ten rows of nearly the same picture. At four
pixels across, hue is the weaker channel.

| | |
|---|---|
| **Places** | gold and angular: square = harbour, triangle = isle, X = dig |
| **People** | round and each its own hue: circle = buyer, ringed circle = a regular or Yoon, **diamond = Finn** |
| **You** | white with a ring, and nothing else on the chart is white |

The three golds can share a colour because their shapes never collide; the people are pulled
apart by hue because they are all round. Other captains moved off green (`#62c8f0`) since a
circle in almost the buyers' green was the single worst confusion on the map.

**Finn is a ruby diamond, the only red and the only diamond**, and it doubles into a ringed
one labelled "Finn — waiting" when he is holding a finished job. He used to be deliberately
absent, on the rule that a rival you can look up is not a rival you find; that was right when
he moved 4,200px per conversation and wrong the moment he was moored, because a fixed
character the chart refuses to show is not mysterious, only missing.

The key is grouped into Places / People / The chart, and every swatch is drawn through the
same shape helpers the canvas uses so the two cannot drift.

## The first sight of the sea

A brand new captain is dropped straight onto `/sea` — the chart took the startup slot. `SetupModal`
and `WelcomeModal` hang off the `(app)` layout because they belong to the account rather than to a
page, so they open **over** whatever page the session lands on, and the session lands here.

**While a captain is being set up there is no sea.** `page.tsx` returns a dark field
(`#0b1a24`, the chart's own base) instead of `SeaMap` whenever `has_seen_setup` or
`has_seen_welcome` is false. The chart used to mount underneath the modals, and that was three bugs
at once:

- Doby's first line appeared along the bottom of the screen while the captain was still being asked
  their name — `SeaFirstVoyage` had already started, and `SeaLandfallHint` could join it.
- The heartbeat wrote a position and a side for a boat nobody had launched.
- The character on the water was drawn in the default colour, because the one being chosen did not
  exist yet.

Not mounting it ends all three at the source. The last modal (`WelcomeModal`, or `SetupModal` when
there is no welcome to play) finishes with `window.location.assign('/sea')` — a **full load**, not
`router.push`: the route is the one we are already on, and a soft navigation may reuse what it has,
while a full load reads the finished profile — name, colour, avatar — and builds the chart once,
correctly. There used to be a window event announcing the end of setup so a mounted chart could
release the tour; with no chart mounted there is nothing to tell, and it is gone.

**Where the first load places the boat is decided by `neverSailed`, not `has_seen_setup`.** The
setup flag closes the moment the welcome does, and the very next read of the row is the one that
places the boat — so a second session on the same account (an old tab, another device) writing its
own position every few seconds wins that read every time. That is exactly how a freshly reset account
came up in its warship beside the Crew Hall, twice, after two resets that had both put the row right.
The first voyage's own step (`!has_seen_sea_tour && sea_tour_step === 0`) is the honest signal: it is
written by the tour and nothing else, so until beat one is taken the captain has never been anywhere
and the row is ignored — `start={null}`, `startSide='fishing'`, which is `HOME` on the fishing boat.
Past beat one the row is trusted, because the tour leaves the chart for the market and has to come
back to where it was.

**The arrival shot** is a fourth factor on the same zoom as the wheel and the casting push-in
(`ARRIVE_FROM = 0.32`, `ARRIVE_S = 2.0`), so it composes with the fitted zoom instead of fighting it
and the frame loop keeps reading one number. The chart opens on about three times the usual sea,
with the captain's boat a speck on it, and comes down over two seconds. Nothing else moves — the
world arrives, not the boat, so there is no splash and nothing to land.

It is a fixed-length ease-out rather than the exponential chase the push-in uses, because this one
has to be **over at a known moment**: the first voyage is waiting on it, and an exponential never
quite lands, so Doby would either speak over the tail of the move or wait through a second of
nothing. The loop eases on its own `dt`, never a wall clock — the rAF timestamp and `Date.now()` are
different clocks and mixing them would put the shot's progress somewhere around minus a trillion.

Only a captain who has never sailed gets it, and only from the top of the tour (`!seen && step === 0`):
a resumed first voyage is not a first sight of the sea.

### Where a new captain actually starts

`sea_x`/`sea_y` are NULL and `sea_side` defaults to `'fishing'`, so the chart falls back to `HOME`
(260, 560) on the fishing boat. The Mainland is at the origin with `r = 500`, which puts that spawn
about 117px off its edge — right off the Mainland, which is the intent.

**A captain who has never sailed has no saved position, whatever the row says.** `page.tsx` passes
`start={null}` and `startSide='fishing'` whenever `neverSailed` is true — see "The first sight of the
sea" above for why that is the tour's step and not the setup flag.

This is not hypothetical. A reset test account came up in its warship beside the Crew Hall at
(-372, -3996), 205px off that island's shore and half the chart from the Mainland, because its own
tab was still open and the sea heartbeat wrote `sea_side='moored'` and the old position straight
back over the reset, twice. Both halves of the report, wrong boat AND wrong place, came out of that
one write, and a northern side also starts the anchorage tour, which is how Doby's "Past the reef,
Captain" ended up on screen behind the setup modal.

Ignoring the row costs nothing, because for a captain who has not been set up there is genuinely
nothing on it to lose, and it means no amount of stale writing can strand a new captain in the
anchorage. See the beta-wipe doc as well; a reset still wants the session gone first.

### The bait beat, and why the bag is state

A new account has **no bait**, and casting is gated on having some. The first voyage used to find
that out at the cast beat, three beats and a sail later, and say so in a line that sent the captain
to "the Daily Bonus in the Tavern, on the Mainland" — a page folded into the Daily Haul disc on the
HUD long before. So the first thing a new captain was told was to go somewhere that did not exist.

It is a beat of its own now, right after the welcome (`until: 'bait'`): Doby points at the disc,
the disc and the worms card inside the sheet both flash (`data-coach="haul"` / `"haul-bait"`), and
the beat advances the moment bait lands. A captain who already has bait never sees it. The coach
card lifts to `z 120` for that beat and for a bait-stuck cast beat, because the sheet is a
`PopupShell` at 111 and the line saying "claim your worms" would otherwise vanish behind the scrim
the moment they did as it said. Target flashing is a quarter-second poll for the life of the beat
rather than a burst of retries, because the worms card mounts whenever the captain opens the sheet.

**The bag is `SeaMap` state, not a prop.** It was read straight off the prop — a snapshot of the row
at render — so the Daily Haul putting twenty worms in that row from a sheet on this very chart could
not be heard: a captain who had just claimed bait was still "out of bait" until they changed page.
`DailyHaul` fires `bait-changed` (`{ baitType, added }`, same shape as `gems-changed`); the chart
upserts the bag and, if that type is on the hook **or the hook was bare**, loads it and sets the
count. The bare-hook case matters for Captains: the page defaults an empty bag to `worm`, and they
claim chum. The bag re-seeds from the prop keyed on content, not identity, because the prop is a
fresh array every render and identity would reset it on every one.

### The first voyage, as designed 2026-09-10

The script is the owner's; the copy in `lib/seaOnboarding.ts` is verbatim and is not to be
"improved". What the engine had to grow to play it:

| # | Who | Beat | Advances when | Lights |
|---|---|---|---|---|
| 0 | Doby | the open sea, how to move (per device) | Next | helm |
| 1 | Doby | worms from the Daily Haul | bait lands (skipped if they have some) | haul disc + worms card |
| 2 | Doby | sail south to the Shallows | in the ring | path |
| 3 | Doby | enter fishing mode (Click *Fish* / hold the helm) | rod out | fish button / helm |
| 4 | Kat | cast your line | **a bite** | cast |
| 5 | Kat | reel in, green catches, gold is perfect | fish landed | reel |
| 6 | Kat | it goes into your hold | Next, 1.6 s after the landing | hold |
| 7 | Kat | XP, streaks pay more | Next | level bar |
| 8 | Doby | to the Mainland to sell | moored there; **rod comes in here** | path |
| 9 | Doby | dock and go ashore | door chooser open | |
| 10 | Doby | the Market | hold sold (advanced by the market) | market card |
| 11 | Kat | find Finn, talk to everyone, treasure all around | Next | |
| 12 | Kat | fishing level and milestones | Next | fishing-level disc |
| 13 | Doby | catch, sell, upgrade; more past the gate; check the map | Aye | chart disc |

Two new `until`s: **`fish`** (rod out; the old `cast`) and **`bite`** (`FishingHere` fires `onHooked` on
the bite; the chart counts them and the tour latches the count the way it latches catches). A new
beat flag **`stowRod`** brings the rod in on the beat that carries it. The catch used to stow the rod
on the spot, which was a beat too early: the hold chip and the XP bar are *inside* the fishing
overlay, so the two lines pointing at them were pointing at things just taken off the screen.

**The deadlock that was in the old script.** "Hold the helm to fish" carried `holdCast: true`, and
`startFishing` refuses while that is up — so the tour refused the one instruction it had just given,
silently, for ever. `holdCast` is only on beats 6–10 now, after the catch, which is the only thing it
was ever for.

**Transitions.** Setup's shell closes (fades) while the welcome scene fades in over it. The welcome
fades to black before the reload, and the chart opens from that same black: a curtain over the
first painted frame lifts over 1.4 s as the arrival starts, a 9vh letterbox holds for the shot and
slides off as the hull lands, the HUD is hidden until then, and the coach card is keyed by its text
so a new beat leaves and arrives rather than rewriting in place.

**The arrival** is 3.6 s from 0.26× on a quintic in-out (it holds on the wide view before it moves,
and settles as slowly), and it **drifts**: the camera opens on open water south-west of the boat
(`ARRIVE_OFF`) and slides onto her through the same override the look beats use, so the Mainland
enters the top of the frame as the hull enters the middle.

### Levels are events, and the disc says so

`claimFishingLevelRewards` used to return early, **without moving `claimed_fishing_levels`**, when
the levels earned paid nothing — and only fifteen levels pay. So a level that paid nothing was never
a level the chart heard about: no card, no notice, the number on the disc simply different the next
time you looked. The action now moves the watermark regardless and returns the span `(from, to]`; the
chart shows `LevelRewardsGrant` on `to > from`, not on `granted.length`, so every level gets its
moment and none gets it twice.

The chart's `level` is **live**: `FishingHere` reports its bar (`onXp`) after each catch, the chart
derives the level from that, and the disc changes the moment the level does. When it rises,
`levelNew` is raised and the disc wears the Daily Haul's pulse ring until it is pressed or a level
card shows. Pressing it while pulsing collects the level (card first) and then opens the spine;
if a stow already collected it, the spine opens straight away. `stowRod` — the tour's path — now
collects too, which is why a level earned on the first catch was never shown before.

### Reflections ride four tenths of the bob

Both boats' reflections are children of the node the chart lifts, so they rode every pixel of the
bob and hull-plus-reflection bounced as one cut-out. A reflection is in the water, and the water is
the thing not moving. `MIRROR_RIDE = 0.4` (seaCaptain for the GPU twins, SeaMap for the DOM
warship mirror via a `--mirror-ride` custom property the loop writes on the boat node): the
reflection keeps the seam at the keel and loses the bounce.

### A water above your level is a wall

The bands' levels used to gate only the **cast**: you could sail the Abyss at level one, you just
could not fish it, which read as a lock that was not locked. `levelWall` (SeaMap) is the innermost
ring the captain is not yet good enough for; its `inner` radius becomes the fishing side's rim in
the same sliding clamp the chart's edge uses (`rim = min(OUTER_EDGE, levelWall.rim)`), and pressing
it raises the campaign's own `heldBy` refusal line: "Need level N fishing to fish in these waters."
The course is cut only when it was set past the wall, so a captain pressed against it can still
click back inward. The `EdgeOfChart` line is reserved for the real edge.

### The portal offers once you have left it

A step through puts the boat down inside the far ring, so the helm immediately offered "Step
through the portal" to a captain who had just done exactly that. `portalArmed` is cleared by the
warp and set again the first frame the boat is out of any mouth; the offer requires it.

### The coach card sits next to the thing it is about

`GuideCoach` takes `anchor` — `data-coach` names, space separated, first on screen wins — and
places the card just below that element if it is in the top half of the screen, just above it if
in the bottom half, centred on it, kept inside the viewport, with a caret pointing at it. It
measures on a short poll, because the elements these cards point at come and go with the game's
own state (a card inside a sheet, a chip inside the fishing overlay). No anchor, or nothing found,
and it falls back to the old bottom/top placement. The first voyage passes the same names it
flashes, so the ring and the card always agree about what is being talked about.

### Later the same day: two beats moved, one cut

The table above is the script as first designed. Since then: the **Almanac beat** was added right
after the hold beat (see fishing.md), the **XP beat** ("every fish gives XP, string perfects for
more") was **cut** as redundant with the level card, which now fires on the crossing itself and
says the same thing with the water's own painting on it, and Kat's fishing-level line moved ahead
of Doby's closing line so Doby has the last word. `lib/seaOnboarding.ts` is the truth; the table is
the shape.

### The first voyage holds the wheel

Until Doby's last card is answered, a new captain may do what the current beat asks and nothing
else. Three things enforce it, and they share one source of truth — the tour's own flash:

- **The class.** `SeaMap`'s wrap carries `sea-tour-lock` while the voyage runs. The rule in
  `globals.css` dims and disables every `[data-coach]` control that is not currently `.coach-flash`
  — i.e. everything the tour is not pointing at. Exempt: the helm (every beat needs the boat to
  move), the desktop action button (it only shows actions the reach filter let through), and the
  XP bar (a display). Every HUD disc, the rod's Loadout/Bait/Log/Hold buttons, the cast and reel
  buttons, the Daily Haul disc and the ashore doors all carry a `data-coach` for this; the crew and
  settings discs got theirs for it.
- **The reach filter.** Where the helm's offers are built, the list is cut to `port:mainland` on the
  ashore/sold beats and nothing otherwise — no hail, landing, dig, portal or fight mid-voyage.
- **The reef.** Crossing north would start the anchorage's own tour over this one; the loop holds
  the boat at the line with a refusal line until the voyage is done.

`SeaFirstVoyage` reports its beat (`onBeat`) and its end (`onDone`); the chart keeps `tourDone` /
`tourBeat` and derives the lock. The market page already collapses to its simple sell view on the
sell beat. What the lock does not cover: the app's own nav bar and tab bar, which are outside the
chart — the tour's step persists, so leaving and coming back resumes rather than breaks.

### Doby calls the sale

A beat after the sold beat, before Kat's Finn line: Doby says the sale landed and points at the
purse in the nav (`data-coach="purse"` on the doubloon pill, both layouts). The tour's lock is
scoped to the chart's wrap, so the nav pill is a target and never dimmed.

### The coach card owns its spot, and the arrival keeps the frame clock

**GuideCoach.** The first anchored version kept the position on the wrapper and swapped cards inside
it, and a tester saw all three consequences: a card born at the bottom that hopped to its target a
beat later (a flash, then the card), a card that crept while nobody touched anything (the flash ring
scales its target and the measurement moved with it), and a leaving card dragged to the *next*
card's spot for its fade. Each card owns its position now — measured before first paint, kept for
its whole life including the fade, moved only for a resize or a real move past an 8px deadband. The
card animates on opacity and y only; a scaling card is rasterised at its first size and the bust
inside it came out soft (the portraits are 1152×928, the softness was the layer). The tour keeps
the coach mounted and passes `show`, so the last "Aye" fades instead of cutting.

**The arrival.** The tour was released on a wall-clock timer while the loop eased on summed `dt`,
which is clamped per frame — and the first seconds after a load are the heaviest the chart runs, so
the loop's clock ran slow against the wall and the timer snapped the second half of the shot. The
shot keeps rAF time now (`arriveT` is the start timestamp; `-2` means armed), the loop calls
`arriveDone` when it lands, and the timer is only a net six seconds past the shot. The letterbox is
gone: it covered the top and bottom of the very picture the shot exists to show.

Also: the ashore beat targets the go-ashore action (`fish helm`), and the "you are not the only one
out here" hail cue is removed.

The `level` ("That is a level, Captain") and `almanac` ("You have a few in the book now") cues are
removed too: the first voyage introduces both with the thing itself on screen, and the level card
now fires on the crossing. Their `live` conditions in SeaMap are inert without an entry to fire.

### The anchorage tour is a real tour now

`GATE_TOUR` opens with the HUD changing sides, then **crew first**: open *Your Crew* (`crewOpen`),
go to *Recruit* (`recruitBoard`, from the hub's `crew-hub-section` event), sign on a hand
(`recruited`, from `crew-changed`), close the hall (`crewClosed`) — then the Gunwharf, the Sea Gate,
the campaign and the pennant as before. `SeaGateTour` reports `onBeat`/`onDone` like the first
voyage; `gateLock = inAnchorage && !gateDone && arrived` joins `tourLock` into `anyLock`, which
drives the wrap's lock class and the reach filter. Cards are anchored (`anchor={target}`) and lift
to z 120 for the beats inside the crew panel. The flash polls for the life of the beat because two
targets live inside a panel the captain opens themselves.

**The arrival waits for the chart to be warm.** It armed on mount, under the curtain, while sprites
were still arriving, so the curtain lifted onto a chart dropping frames. Both the shot and the
curtain now wait for `spritesReady`; the shot multiplies a base zoom cached at its start instead of
calling `fit()` (a layout read) every frame; the curve is cubic in-out over 4.4 s. The story scene's
bust rises into place instead of sliding in from the side.

### The tab's own snapshot obeys the same rule as the row

`rememberPos`/`recallPos` keep the boat's position in **sessionStorage**, written synchronously on
the way out so it beats the fire-and-forget server write (see the note on the recall effect). It is
per tab and it outlives everything else: the profile row, the auth session, a reset.

So it defeated the `neverSailed` guard on `page.tsx`. A test account wiped with its tab still open
came back through setup and landed in the anchorage at the coordinates it had been wiped from — the
row said `fishing`/null, the page honoured that, and the recall's `useLayoutEffect` overwrote
`pos`, `sideRef` and `inAnchorage` a moment later. The heartbeat then wrote the restored position
back to the fresh row, which is why the row read `anchorage` seconds after a clean reset.

**The row and the snapshot answer the question the same way now**: `neverSailed`
(`!tour.seen && tour.step === 0`) skips the recall entirely and calls `forgetPos()`, so a stale
snapshot is not waiting for the next reload either.

## North of the reef IS the ship (2026-09-10)

**The reef is the change of boat.** Cross it north and the warship is under you; cross back south
and the fishing boat is. There is no longer a third state — north on the fishing boat — and no door
at the Gunwharf that changes hulls. Everything above that says "take her out", "tie her up",
"your ship lies at the berth" or "the Gunwharf's two doors" is superseded by this section.

- `onShip` / `shipRef` initialise from `startSide !== 'fishing'`; the sessionStorage recall does the
  same (`ship = north`). `sideNow()` writes `moored` for north and never `anchorage`; the word stays
  in the `SeaSide` type so an old row still reads, and it reads as aboard.
- **`crossHull(toShip)`** is called from the reef-crossing arm the moment `isNorth` flips (via
  `crossHullRef`, since the loop closes once). It flips the hull, keeps way on, and plays the
  portal arrival's three beats — light under the hull (gold north, sea-blue south), the water
  giving, the swell — plus a brightness flash on the boat node (`.sea-hull-swap`). The canvas takes
  the hull from the `ship` prop, so the drawn ship follows `onShip` with no extra plumbing.
- The "warship does not go down through the reef" hold is gone; so is the `GunwharfAshore`
  two-door chooser and `swapHull`. Mooring at the Gunwharf opens `ShipSheet('ship')` directly, and
  the reach label reads "See to your ship at the Gunwharf".
- `ShipAtBerth`, `SHIP_BERTH_OFF`, `berthedHull` and the per-frame `gpu.berthed(...)` are gone;
  the canvas is told `berthed(null)` every frame because nothing lies at the quay.
- Friends: `visitActions.friendsAtSea` derives `onShip = sea_side !== 'fishing'`.
- The anchorage tour's first beat is the change of boat: "feel that: the boat under you changed.
  This is your expedition ship…". The Gunwharf look beat now says it is where she is refitted and
  armed.

### The anchorage tour: forced, then arrived at

`GATE_TOUR` is in two halves.

**Forced (0–6, through `GATE_FORCED_THROUGH`).** The boat changed under you, the anchorage, the HUD
changing sides, then the crew chain: open Your Crew → Recruit → sign a hand → what a crew is. The
wheel is held for all of it, exactly as the first voyage holds it.

**Arrived at (7+).** Every remaining beat is about a PLACE, so it is **current but silent** until
the captain is standing at it (`showWhen: { moor: 'gunwharf' }`, `{ near: 'sea_gate' }`). Flying the
camera to a shore and narrating it is a slideshow of somewhere you are not; a line that arrives as
you tie up is about the thing under you. **The lock ends at the first `showWhen` beat** — the tour
is asking the captain to sail somewhere and cannot dim the helm's own offers to do it, which is why
`GATE_FORCED_THROUGH` is derived from the script rather than written down.

**A revealed card stays revealed.** `shown` in `SeaGateTour` only climbs, so a card that has
appeared survives sailing off again and is answered with Next like any other — a card that vanishes
because you moved is a card you have to go back for.

`overPanel: true` marks the beats drawn above the crew panel (z 120); it replaced a hard-coded list
of `until` values, which broke the moment a crew beat became a plain `next`. `crewClosed` is gone
with it.

### Clean slate north of the reef

Everything the game says unprompted on the expedition side has been removed, back to the seven
beats of `GATE_TOUR` (the boat changed, the anchorage, the HUD, and the crew chain through "that's
your crew"). Cut with it:

- the tour's own tail — the Gunwharf, the Sea Gate, the campaign, the pennant and the send-off;
- the five expedition cues in `SeaCue` — `crew`, `loadout`, `nav`, `call`, `wargate` (`chart` stays:
  it fires on the fishing side too);
- the five northern landfall hints in `SeaLandfallHint` — Crew Hall, Charterhouse, Posting House,
  Forge, Trawl Harbour. The southern four (Shipyard, Tally House, Homestead) are untouched.

**The `showWhen` mechanism is kept and is now unused.** It is the shape the next section's place
beats will take: a beat that is current but silent until the captain is standing at the thing it is
about, and stays once shown. `GATE_FORCED_THROUGH` falls back to the whole script when nothing is
gated, which is where the anchorage stands today — all seven beats hold the wheel.
