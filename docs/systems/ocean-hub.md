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

That only works because the chart tells you. **The Docks island carries a warm bloom and a
"2 crew back" line above its name plate whenever somebody is waiting**, and the compass
promotes it over the nearest port — proximity is what you need to get home, but a dock with
a haul on it is the thing nothing else on the screen would mention.

It costs no polling: the page hands down the ISO moment each running trawl comes due, and the
map counts how many have matured on a 5s tick. A crew finishing while you are halfway to the
Abyss lights the island up on its own. The bloom is slower and gentler than a hotspot's on
purpose — a haul does not spoil, so it is a "whenever you get round to it", not a summons.

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

**The terrain is bands that follow the coast.** It was one flat radial gradient of brown; a
single colour with a vignette is a shape, not a place. Each band is the *same* polygon on a
smaller box, so its clip scales with it and every ring parallels the shore instead of being a
circle sitting inside an irregular outline. Outside in, the way you would walk it: wet sand,
dry sand, scrub, grass, and a lighter crown where the ground rises — the crown offset toward
the same corner every other highlight on the chart is lit from, so the scene agrees about
where the sun is. Then soft dark clumps for woods: not trees (a tree is two pixels here) but
the massed shadow a stand of them throws.

**Surf** is two collars hugging the coast, breathing slowly and **out of phase** — in phase
they read as one ring pulsing, which is a UI element; out of phase they read as swell
arriving. Water hitting a shore is the most recognisable thing about a shore, and without it
the land met the sea on a hard vector edge, which was most of why these read as shapes.

**The shoal** widened from a 6px-blurred halo at inset 2% to three soft layers from −6%
outward. Shallow water round a real island is a broad pale shelf that fades out with no edge
anywhere; a thin halo is a glow.

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

## Controls that are not the sea

The map steers on **two** paths — `onDown` (pointerdown, for the thumb helm) and `onTap`
(click, for a course order) — and a control has to be exempt from **both**. `onDown` bailed
on `closest('button, [data-no-steer]')`; `onTap` did not, so anything marked `data-no-steer`
still put the helm over on the click that followed. The level bar was the one anyone would
notice, because it looks tappable and past Fishing 100 genuinely is.

**A control is a control on every path that can reach it.** When adding a new steer path,
copy the guard.

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

The only thing still drawn beneath is the pale **wash** where an object breaks through: pale
rather than dark, because water piles up and catches light around something standing in it
rather than casting a shadow on itself. It sits in the un-counter-squashed wrapper so it comes
out an ellipse lying flat, and it breathes on its own slow offset. Islands keep their offset
contact shadow: they are extruded solids and that shadow is correct.

Placement is **solved and asserted, never eyeballed** — buildings inside the coastline,
landmarks inside their zone and clear of each other, resident buyers reachable. Four of
five buyers were first placed inside solid landmarks, which would have made them literally
unreachable.
