# The Steam port — PARKED IDEA, NOT A PLAN

**2026-09-30, KONG: THE STEAM GAME IS REBUILT IN GODOT.** This reverses the 2026-09-28 "wrap in
Electron" decision (stage 3 below). The reason: multiplayer is now at launch (Charters, co-op
raids, crew dives), none of the screens were built for more than one captain, and with the game
desktop-only a real engine is the better home. What carries over: the rules and cores in
`web/lib` (the SPEC for the port, with their checks), the content JSON, the art in
`web/public`, and every design decision on this page. The Electron shell (`desktop/`) is no
longer the product; it stays as a reference for how the offline game behaves until the Godot
build passes it. Weighed and accepted: the rewrite is months before multiplayer starts (about
155k lines of screens and 69k of rules at the time).
- LANGUAGE: GDScript with static typing; Steam through GodotSteam (its multiplayer peer too).
- FIRST SLICE: the sea chart and fishing, solo and matching the rules, then a second captain
  joining over a Steam lobby and sailing the same sea. Co-op raids after the co-op combat
  design sitting.
- PARITY: the TS cores generate test cases (a save plus seeded rolls in, the save out) and
  the Godot build must replay them exactly; a system is ported when it matches.
- THE WEB BETA: stays up, FEATURE-FROZEN, bug fixes only. New features go into Godot.
- THE ANCIENT DEEP FIGHT COMES BACK (Kong, 2026-09-30): the web sea resolves every fish,
  the giants included, in one tap (the multi-phase reel lived in the deleted
  app/(app)/fishing/FishingGame.tsx, in git at 7e1891b9^), so a Vigil rank needed one
  perfect tap and the Vigil's scaling (extra phases, a tighter window, a faster needle) drove
  nothing. The Godot build brings the fight back as the old screen had it: every Ancient
  Deep fish is multi-phase (the six giants 3 phases, Megalodon 4, each with its mechanic, plus
  the Vigil's extra phases; the twelve regulars 2 phases with theirs), a miss lets it go, and
  only the final phase's result goes to the reel.
- GODOT VISUALS (Kong, 2026-09-30): the painted house style stays; NO 3D lighting or 3D sea
  (the August prototype's lesson). Adopted: water shaders over the painted plates (flow,
  ripple, shore foam, glints, per-zone currents), 2D night lighting (a CanvasModulate tint
  plus soft Light2D glows from lanterns, the lighthouse, windows; no shading on the art),
  GPU particles (subtle and local), and shader glows on art (goldens, Vigil frames) in place
  of CSS filter stacks. Used as a matter of course: Camera2D (no screen shake), AnimationPlayer
  for staged moments, native parallax, one UI Theme, controller focus from the start, audio
  buses, GodotSteam's multiplayer peer.
- STAGE 0 BUILT (2026-09-30): the project is `godot/game/` (Godot 4.7.2; the parked August 3D
  prototype `godot/sea/` was deleted the same day at Kong's word, in git history). `core/dice.gd` (mulberry32 and seedOf, exact),
  `core/clock.gd`, `core/js_json.gd` (numbers as JS doubles, written as JSON.stringify does),
  `core/save_file.gd` (the v13 local save format, read and written byte for byte).
  `web/scripts/parity-export.mts` writes the cases (dice, saves, three fishing sessions of 433
  calls from `lib/data/local/starter.ts`'s new captain, now shared with the desktop shell);
  `tests/parity.gd` replays them; `node tools/parity.mjs` runs it all. GodotSteam 4.22.1 is
  fetched by `tools/setup.mjs` (pinned, checksummed, not committed) and loads. Porting rules
  are in `godot/game/README.md`. Fishing is PENDING until stage 1 ports the cast and reel.
- STAGE 1, THE RULES, BUILT (2026-09-30): the cast, the reel and the crate
  (`core/fishing.gd` over `core/captain_store.gd`) replay 1,903 TS calls in 10 sessions
  exactly (results, rolls per call, the save at the end): every special rod (YOLO jackpots,
  Twin Strike, Locked-In to stage 3, Galaxy wormholes, Lightsaber, Treasure, a three-effect
  Completionist), the Ancient Deep with the Vigil hunt and rank-up and the first-catch
  letter, goldens, snags, resumed casts and zone hops, bloom and red tide, the Primeval Eye
  and the Borrowed Jaw, the Sigil and the Phantom Hook, full holds and level gates, crates
  with pets and cosmetics, four dailies; plus 2,000 day-and-level daily picks. Tables come
  from `web/scripts/export-godot-rules.mts`. Not ported yet: hotspots (need the chart), and
  the rest of lib/core/fishing (wormhole reroll, Tide Turner, goldens, level rewards,
  Almanac). A TS bug found on the way: the local store stamped a shiny with the real
  clock, fixed.
- THE REST OF THE SEA, STAGE 1 (2026-10-01): the ports, sailing and the Shipyard.
  - EVERY PORT IS ON THE CHART from the web's own placements (rules.json "ports", exported
    from chart.ts PLACES with their plates, buildings and berths): the Mainland, the Shipyard,
    the Homestead, the Tally House, the Trawl Harbor, and the anchorage's Crew Hall, Posting
    House, Forge, Gunwharf and Charterhouse. Each has its berth and the web's dock label, and
    every shore stops the hull. The Mainland and the Shipyard open; the rest say they are not
    built yet.
  - SAILING IS THE WEB'S HEADING MODEL (SeaMap.tsx): the bow comes round at the rudder's rate
    (faster from a standstill), she picks up along her heading at the rig's rate, sideways
    drift bleeds off, and a long straight run reaches full sail (x1.15). Top speed is 300 x
    hull x the boat's speed; turn and pick-up take the boat's agility. Grade and trim are now
    exported with the boats. The lantern's rung sets how far the boat's light reaches at
    night.
  - THE SHIPYARD (`game/shipyard_room.gd`, `core/shipyard.gd`): Refit your boat (Speed,
    Turning, Pick-up, Hold, Lantern), each read in real units with the whole ladder and a
    confirm; Your rig (the loadout). The rules (buyShipyardTier, equipRod) are ported with a
    40-call parity session. The rod rack is retired on the web too: every rod you own sails
    with you.
  STAGE 2, HOTSPOTS (2026-10-01): `core/hotspots.gd` ports lib/seaHotspots bit for bit (the
  hash and xorshift stream in 32-bit arithmetic): three patches every ten minutes, one shoal,
  trench and flotsam, each in its own band, tier 1 to 3, all derived from the clock. The cast
  sends where the line went in and the rules re-derive the patch (shoal: wait x0.95/0.93/0.90;
  trench: rarity bonus 0.15/0.45/1.1; flotsam: crates x1.6/2.2/3). Parity: 2,000 moments of
  standing patches, and a session of 312 calls cast inside and just outside them.
  `game/hotspot_patch.gd` draws each as a breathing pool and rim in its kind's colour; the
  HUD's badge names the one you are in (family, tier dots, name, effect, minutes left). In a
  Charter everyone sees the same patches (they come from the clock).
  STAGE 3, EXPLORING (2026-10-01): `core/explore.gd` ports goAshore, digHere, openBottle,
  getDigState, the fog part of saveSeaPosition, and lib/seaBottles and lib/seaExplore, with
  JavaScript's arithmetic where it matters. Bottles hash with doubles past 2^53, so `to_u32` is
  the spec's ToInt32, and positions stay in doubles because Godot's Vector2 is 32-bit. Parity:
  1,287 bottles at 400 moments, and a 612-call session landing on all 27 isles, digging all
  12 sites and fishing out bottles, every refusal included. (Godot's JSON reader rounds a
  17-digit number in its last place; the bottle check allows that and nothing more.)
  ON THE CHART (`game/sea_finds.gd`):
  - The 27 isles on their plates, with a chest, an open chest or a note post. Their name and
    band show when near, with a tick once landed, and their shores stop the hull.
  - "Go ashore at" or "Look again at" pays once, with the salvaged furnishing and the portal
    stone when the chest holds one.
  - The water looks odd over a dig site (faint rings that brighten as you close in), and
    "Dig here" pays when you are over one.
  - Bottles drift on their eleven-minute windows. "Take the bottle" reads the note, and a
    third carry a bearing.
  - The fog lifts three cells square around the boat and is saved with the position (which
    every claim now flushes first, as the rules check it).
  The fog is not drawn on the main chart, as on the web: the minimap (not yet ported) is
  where it shows. In a Charter the isles, digs, homestead and fog are the crew's.
  STAGE 4, THE REGULARS AND THE TRADERS (2026-10-01):
  - Rules. `core/folk.gd` ports lib/seaFolk and the folk actions (rapport, the day's word, a
    favourite asked for and brought, the two rods at full rapport, traderPos). `core/traders.gd`
    ports lib/seaTraders (traderAt, runnerAt, tradersAround, traderFromKey, Yoon) and
    strikeDeal, wagerForRunnerRod and dealtToday. Two JavaScript traps live in the hash: the
    constants must be the hex literals, and `(c|0)` wraps the runner's seed (a night's index
    times 7,919) to int32 before multiplying.
  - Parity: 1,296 wanderers in 300 moments by day and night, a 1,854-call regulars session and a
    732-call wanderers session (bait, salters, talkers, the cap of six, keys kept past their
    day, and the runner's cut won, lost and refused).
  - On the chart. `game/wanderer.gd` is anyone on the water: a hull working its beat by
    traderPos, with a plate (their name, and their kind, or a regular's role in their accent;
    "Traded today" greys it). Buyers now use it too, so they move from spot to spot and sit a
    while like the web's residents. The nine regulars and Yoon are moored from the start;
    strangers are re-derived as the boat crosses a cell or the light turns (runners at night).
  - `game/trader_panel.gd` is the hail card: the offer stated plainly (bait under the shop's
    price with the saving, the salter's rate, the runner's stake and odds), "N deals left
    today", "Go on" through a talker's lines, and at full rapport the regular's rod.
  - `game/folk_scene.gd` is the conversation: `game/avatar.gd` (the web's round portrait),
    their lines typed out (`game/typed_line.gd`, the web's 22/80/190ms rhythm), the rapport bar
    with the gain floating off it, the questions their tier opens, the favourite asked for
    and brought, and the crest when a tier is crossed (three rings for the top).
  - In a Charter, rapport and the deal cap are each captain's own; the purse the deal moves
    is the crew's.
  - Ported faithfully, worth Kong's call (the web does the same):
    1. Yoon's Locked-In Rod is in the runner's pool, so it can be won off a runner.
    2. The runner's cut counts toward the six-a-day cap.
    3. "Once a night" is once per UTC day.
    4. "You have already had a word with" uses the full name where every other line uses the
       short one.
  STAGE 5, THE PORTAL AND THE RECALL (2026-10-01): `core/portal.gd` ports lib/seaPortal,
  lib/seaRecall, buyPortalTier and spendRecall. Parity: a 44-call session buying every rung
  (refused without the stone, then without the money, then past the top) and the recall on
  both sides across its 48 minutes. The web's "No stone" refusal had an em-dash; fixed on both
  sides.
  - On the chart, `game/portal_well.gd` is the well off the Homestead. It turns in the colour
    of the furthest water it reaches and gathers when the boat sits in its mouth. It is still,
    grey "dead water" until a stone is opened, and its board says where the stone is.
  - Sitting in the mouth offers "Step through the portal". It never takes you by itself, and
    after a passage it only offers again once you have sailed out of the mouth.
  - `game/portal_sheet.gd` is "Where to?". The waters it reaches sail at a press, the next is
    priced and says whether the stone is in hand, and the crossing to the Anchorage shows
    locked (the expedition side is not ported).
  - The passage (portal and recall alike) brings the light up, moves her under it, clears it,
    and rings the water out where she surfaces.
  - The RECALL is a pill on the HUD's clock row, "Recall home" or "Recall in Nm". It goes to
    the portal's mouth, once a sea day/night cycle. The web keeps it on the minimap, which is
    not ported; it can move there when the minimap is.
  - In a Charter the portal's rung is the crew's (stones come from the shared discoveries),
    and each captain has their own recall.
  THE REST OF THE SEA IS DONE except the minimap/fog drawing and the expedition side.
  WAKE AND WATERLINE (2026-10-01, Kong: "the wake and trail are not right, no reflections"):
  - `game/wake.gd` ports seaWake.ts for every hull on the chart, in one layer under the boats:
    streak pairs laid at the cutwater every 32ms that open into a V, churn behind the bow,
    bow spray past 45% speed, and rings from under the keel at rest. The old particle spray
    is gone.
  - `Skipper.water` adds seaCaptain.ts's waterline: a soft shadow, the water coming up the
    hull (`fx/hull_soak.gdshader`), and the reflection.
  - The reflection goes PAST the web (Kong: "the web app is just the baseline; use what Godot
    offers"). The mirrored boat is drawn into a CanvasGroup, so it fades as one image (the
    web's per-sprite alpha let parts show through each other). `fx/hull_mirror.gdshader` then
    ripples it with the water, pulls it toward the sea's colour, and dissolves it with
    distance. It is mirrored about the lowest PAINTED row of the hull, not the sheet's edge.
  - The captain sheets (`fishing_<color>_<pose>.png`) had a pale ripple painted under the
    plain hull. The sheet is drawn under every boat, so a static ripple sat on every hull.
    `tools/setup.mjs` erases it from the Godot copy (translucent, non-brown pixels in the
    bottom 30%, inside the hull's width, which keeps the fishing line and the ring where it
    enters the water). The web's art is untouched; hashes in art/.derippled.json mean it only
    reruns when the web's art changes.
  THE SEA PAST THE WEB (2026-10-01, Kong: "do it all, I wanna see what's possible"). Nine
  stages, each its own commit. Visual only: no rule or number changed, and the squalls
  are a rules-exact port (parity: 2,360 squalls in 2,000 moments).
  1. REACTIVE WATER (`game/sea_field.gd`). An off-screen SubViewport of height: the Wake's
     own MultiMeshes, a push under every hull, and rings for casts, bobbers and splashes.
     The water shader reads its slope for light and shade, foam, glints and a bent swell,
     and at night the stirred water glows.
  2. SHORES (`game/shore.gd`). Each island plate is traced from a coarse copy of its alpha
     (so palms and spars drop out) into a LightOccluder2D. Godot's 2D distance field then
     gives the water lighter shallows and broken foam lapping in toward each beach.
  3. LIGHT. `tools/setup.mjs` makes normal maps from the land's paintings; `game/lit.gd`
     pairs them (with specular off, since land is not glossy). A DirectionalLight2D sun
     follows the sea clock: white by day, low and warm at dusk, blue at night. Island
     shadows on the water are raymarched toward the sun through the distance field. The
     world sits at 0.88 by day so the sun has room to model it.
  4. GLOW AND GRADE. A WorldEnvironment (post stops at layer 0, so the HUD is never
     touched) blooms what is nearly white and grades each water by band. HDR 2D was TRIED
     AND DROPPED: it moves the whole canvas into linear colour, and every painting and
     shader here is sRGB.
  5. BOATS IN THE SEA. `Skipper.sway()` adds bob and roll (rougher further out and in a
     squall), a heel into turns and the bow lifting under way, pivoted on the waterline.
     The reflection counter-rotates.
  6. NIGHT. Every lamp throws a rippling column down the water: hers, each wanderer's own
     lantern, the town, the berths, the portal. Stars glint. The web's blooms
     (lib/seaBlooms) mottle their waters, and deep motes drift up in the Abyss and the
     Ancient Deep.
  7. WEATHER (`core/weather.gd` + `game/squall_fx.gd`). The fishing sea's squalls, ported
     exactly. Under one the water goes slate, choppy and rain-pocked, rain drives across,
     the light greys and hulls pitch. The heaviest squalls throw lightning that lights
     the whole sea (the web only paled the storm's shadow, and only in the north).
  8. SOUND (`game/sea_sound.gd`), all synthesised on audio buses:
     - hull hiss with way, swell, wind further out, and rain
     - positional surf at every island, gulls from the shore or the nearest flock
     - a creak on a hard turn, and thunder after lightning
     - a low-pass that closes in at night, in deep water and while a panel is up
     The web's version was admin-only and its recordings were never made.
  9. LIFE AND SKY (`game/sea_life.gd`, `game/sea_sky.gd`). The web's shoals (density map,
     hotspot pull, bow-wash bolting, scatter on a cast), drift flecks, gulls over shoal
     and flotsam hotspots with shadows and alarm, clouds with parallax and shadows on the
     water, and the horizon haze. Godot additions:
     - shoals look beneath the surface (dark in shallow water, pale in deep)
     - gulls cry
     - clouds take the hour's light
  Not yet: the minimap (its fog), the settings gear (a sound mute too), leviathans and
  north weather (with the expedition sea).
  FOLLOW-UPS (2026-10-01, Kong's playtest):
  - Cloud shadows were black boxes (a plain multiply ignores alpha); fx/cloud_shadow.gdshader.
  - The moon road and the drift glittered constantly; both calmed.
  - "Dig here" from a boat became "Drop the grapple", with bubbles in place of drawn rings.
  - THE WAKE is a V from the cutwater (the web's GPU wake set the streaks out at full width,
    so it drew two parallel lines).
  - THE STANDING RIPPLE laps along the hull at irregular times and sizes instead of one hard
    ring from a point.
  - THE POSE SHIFT: the wait and cast sheets draw the boat 60 px right of rest (wait 32 px
    higher), so the boat jumped on every cast. Skipper measures each sheet's hull and offsets
    the pose by it; the bobber's ring follows (Boat.hook_at).
  - CURRENTS, KELP, FULL SAIL. The web's five lanes and eight beds come from the TS
    (rules.json "flow"); game/sea_flow.gd ports currentAt and kelpAt and draws the lanes
    (scrolling ripple strips) and beds. Boat._flow pushes, holds and fills the sails as
    SeaMap does. The HUD carries the web's cue chips. Godot adds streaks of water rushing past
    at full sail.
  - THE DIAL (fx/dial.gdshader): a brass bezel with engraved ticks and rivets, a bevelled
    track (the live zone lit, the perfect a moving sheen, the snag striped), a glass face with
    a compass rose and light under it, and a comet trail behind the needle. A tapered brass
    needle reaches into the track, under a domed hub. The logic and the lock-in are
    unchanged.
  SECOND PLAYTEST (2026-10-01):
  - BOXES: cloud shadows and kelp used a multiply, whose neutral white the sea's
    CanvasModulate greys, so their empty corners showed as boxes. Both are now plain
    see-through darkening. Do not multiply anything in the World.
  - THE FISH swim head first, bend as they swim (fx/fish_under.gdshader), and live
    UNDER THE SURFACE. They draw into sea_field.gd's `under` SubViewport, which the water
    shader lays beneath its own surface, refracted by the swell, with the light, glints,
    foam and wake on top.
  - Hold the mouse on the water and she keeps sailing toward the pointer (and on past it).
  - THE MOORINGS are rebuilt (berth.gd). In place of the web's glowing pool, neon rim and
    14 lamps: wooden pilings with rope and lanterns along the shore edge of the berth,
    placed only on open water, and a line of cork floats round it. Lantern light runs down
    the water at night, and inside the berth the lanterns and floats warm.
  - Floating things get reflections (SeaFinds.reflect): bottles first.
  - THE GLITTER: the drift flecks are off, the stirred-water glints are gone, and the web's
    sun glints are broader and slower.
  THIRD PLAYTEST (2026-10-01):
  - THE GLITTER WAS THE FISH. Pale fish in deep water read as scattered sparkling dashes,
    day and night (found by diffing two frames of open water). Fish are now shadows only:
    the water darkens where one swims and never brightens.
  - REEL IN fired on the button's release (a Godot button's default), so the needle ran on
    until the click came back up. It now fires on the press (ACTION_MODE_BUTTON_PRESS);
    the keyboard and a click on the dial were already immediate. The strike freezes the
    angle drawn on screen.
  - HOLD TO SAIL: let go after a hold (over 0.22 s) and she eases to a stop; a quick click
    still sets a destination.
  - MOORINGS (second rebuild): the drawn pilings and floats clashed with the painted world.
    A mooring is now the WATER. The shader paints a calmer, lighter harbour patch with a
    soft broken foam edge (u_berths), warming while she is inside. Berth.gd only holds where
    and how lit.
  - THE DIAL IN WATERCOLOUR (fx/dial.gdshader, restyled): pigment washes for the zones,
    pooling darker at their edges and granulating, the live zone the full pigment. An
    ochre rim with ink ticks, an indigo face blooming lighter at the centre, paper grain
    and brush-uneven edges. The needle is a stroke of ink with a tinted point.
- THE WORLD CHART + GPS (2026-10-01; Kong: "a lot more feature rich", "set a track to a
  location you click"). M, the pad's Back, or the HUD "Chart" pill opens `game/world_map.gd`
  over the sea (which runs on under it). Paper (fx/chart_paper.gdshader) under the painted
  land plates; the captain's real fog grid stamped soft at 4x and sampled through a warp
  (fx/chart_fog.gdshader) so clearings take coastline shapes. Layers toggle as ink stamps:
  ports, people (regulars, traders, runner), hotspots (name + minutes left), weather
  (squalls), currents + kelp (only where charted), finds (bottles, dig sites), pins. A paper
  sheet carries the per-water tally (charted %, isles, dug). Click a mark for a card (Set
  course / Set course & sail / Drop a pin); click open water to set a course. Pins live in
  Prefs "pins:<uid>". Find my boat, Recall home.
  ROUTING: `game/sea_route.gd`, AStarGrid2D at 160 px over the sea; islands solid at their
  shore + hull, kelp costs 2.5x, the rim solid; a port routes to its berth; the path is
  line-of-sight smoothed (builds in ~13 ms). `game/course.gd` keeps the course: dashed line
  and destination rings in the world, an edge pointer when off screen, a HUD chip with the
  ETA, AUTOPILOT (steers to a point 320 ahead on the path; any helm input hands it back),
  reroutes past 450 off the line ("Recalculating"), and toasts "Arrived" inside 220.
  Rules untouched; the course is presentation and steering only.
- AFLOAT, NOT ON TOP (2026-10-01; Kong: objects should look like they displace the water,
  submerged slightly at the bottom). The web's soak plate (a tint ramp over the hull) is
  retired. `fx/waterline.gdshader` goes on every upright part of a boat that reaches the
  water (the base sheet too, since it paints a plain hull under the boat overlay) and on
  bottles: below a lapping waterline the picture wavers, takes the sea's colour and fades
  out by the keel; just above, the wood is wet and dark; at it, a faint bright lip.
  `fx/water_collar.gdshader` on a twin behind the hull draws the water pushed aside: a
  thin pale lens heaped at the waterline and a wider dark trough, both ellipses from the
  hull's width measured once on the CPU (Skipper.span_at; sampling the picture along the
  row in the shader stepped into bars), its region grown past the picture so the ring is
  not clipped. Skipper.SINK 0.04 -> 0.055 (she sits a little deeper).
- THE LOCKER + PAPER MENUS (2026-10-01; Kong: rethink the menus for Godot, improve the
  inventory and loadouts; chose painted paper and wood, and OWNED GEAR ONLY, no silhouettes
  of what you lack). `game/paper.gd` is the paper kit (fx/paper.gdshader: grain, fibres,
  tea-stained deckled edge; a watercolour blot mode for art; Paper.button, Paper.Tile with
  the worn item circled in red ink). `game/locker.gd` replaces the web's Loadout, Bait and
  Hold sheets (Menus keeps only the crew purse): I / the pad's X, or the HUD's Loadout,
  Bait and Hold buttons, which open it on that tab/slot. The camera pushes in on HER boat
  and sets it left (Sea.stage, eased; the captain's own zoom untouched), the world dims
  (fx/locker_veil.gdshader), the HUD steps aside. LOADOUT: slots Rod, Bait, Look, Hat, Boat,
  Pet, also as paper tags inked to the part they change (Skipper.anchor); hover tries it
  on the real boat (a ring on the water); press equips through the same actions. Rods and
  bait show a small painted dial (Dial.build_zones for a difficulty-3 bite) with today's
  catch-zone edges as ink ticks, and the stat deltas in green/red. HOLD: one pip per space
  coloured by rarity, fish tiles, sort by value/rarity/name, Market total against this
  water's buyer at their rate. LOG opens the Almanac. Tab switches tabs.
  QUICK-SWAP WHEEL (`game/swap_wheel.gd`): hold Q / left shoulder between casts, bait and
  rods fan out round her, point and let go. Not changed: the HUD's own dark bottom row and
  chips, the Almanac, the rooms ashore (LoadoutView still serves the Shipyard).
- EVERYTHING ON PAPER (2026-10-01; Kong: "build everything in the same paper style"). Done
  at the root, not screen by screen: Pane.paperize turns any dark solid fill into paper
  (tinted stops become tinted paper, light hairlines ink, shadows soft, sheens gone) and
  pane.gdshader grains it, tears its edge and stains it (`paper`; wood grain for planks).
  Words are inked when they LAND on paper: Kit.style/face hook every label, and on entering
  the tree it takes Kit.ink(raw) if the nearest ancestor with a "paper" meta says paper
  (light neutrals to the ink ramp, bright accents to their dark pigment); words on the
  water or a dark backdrop keep their colour, and Kit.lift opts a label out. In a Room
  (meta "paper_room") see-through tinted panes are forced to paper too. Kit.button:
  secondary paper, accent tinted paper, danger red paper, PRIMARY a plank of stained wood
  (as are the back pill and the Cast button). Text fields, scroll bars, tabs, the XP pill,
  the name tags over folk and crewmates: paper. Specs marked "keep" (washes over art, wood)
  are left alone. THE LOG IS IN THE LOCKER: Almanac.embedded drops its frame and header and
  lays the book on the Locker's sheet, which widens to nearly full width for the Log tab
  (Tab cycles Loadout, Hold, Log); leaving the tab stamps the book read. Left dark on
  purpose: the giants' slabs (paintings of the deep), the level-up and other full-screen
  moments over a scrim, the rooms' painted backdrops.
  FOURTH PLAYTEST (2026-10-01): SEA-WORN PARCHMENT, the paper's own tone (Kit.PAPER
  0.83/0.77/0.65, deeper inks, hovers lift by 0.1 not 0.35; the chart's paper and fog
  follow) because fresh paper glared. The LEVEL BAR is an instrument, not paper: a
  stained plank trimmed in brass, the level on a brass medallion, XP as sea water in a
  glass vial with a meniscus and bubbles (gold water at the top). PERSPECTIVE: the ripple
  painted where the line meets the water is erased from the wait sheets (setup.mjs
  deripple v2) and the sea's field rings make it, on the plane; the shore's foam bands are
  measured on the plane (the SDF distance scaled by its gradient through 1/GROUND), so
  they thin above and below an island. Every hull laps alike (the waterline and collar
  waves scale by the picture's height against the sheet, `ref`); the collar's width is the
  longest solid run on its row, so the fishing line is not counted as hull. A click while
  the line is out no longer sets a heading (she sailed off to it after the catch).
  FIFTH PLAYTEST (2026-10-01): THE TITLE SCREEN redrawn (title.gd): two sheets that do
  not look alike, SAIL ALONE (plain parchment, one boat) and SAIL WITH FRIENDS (sea-dyed
  parchment, a fleet); captain cards with portraits drawn without water on a sea wash;
  a NEW CAPTAIN creator with the four free starting colours (Green, Gray, Blue, Pink, the
  web's first-visit SetupModal) and a big live portrait (Captains.make(name, color));
  Charter cards show each crewmate's portrait (berths now keep a "look") and open berths;
  Found (with the same creator, Charter.found(..., color)) and Join fold open. Joining
  still takes the default colour. The STATUS CUES are lettering on the water, not
  chips. The LEVEL BAR is lettering too (the brass instrument was rejected): level in
  Cinzel, a thin line of light with a breathing bead, what is left and the next reward.
  THE CURRENTS, upgraded: SeaField renders a FLOW MAP (each lane one strip with shared
  corners, rg = way it runs, b = strength; overlapping quads doubled into stripes) and
  the water shader darkens and blues the channel, streams its surface with flow-mapped
  noise smeared along the lane (two phases; the way it runs averaged over a ring so bends
  are smooth), and lights a faint seam at its edges; SeaFlow carries 70 foam flecks per
  lane at the lane's pace, faster mid-stream.
  NOT A ROAD (Kong: the currents read as highway lanes): the seam lines are gone; the edge
  wanders (strength broken by slow noise, so a current swells, narrows and frays into the
  still water), the flow map's lane varies in width and bends along its length, the tint
  is lighter, the streaks gather and thin, small broken eddies turn off the fraying edge,
  the old painted strips are at half strength (the body strip off), the flecks a touch
  brighter.
- CRATES ARE STOWED, OPENED WHEN YOU CHOOSE (2026-10-01, Kong). A RULES CHANGE, port only:
  the HUD calls "stowCrate" (Fishing.stow_crate: reelCrate's claim and perfect streak, then
  profile.crate_stash[tier] += 1, stat fishing_crates_caught) and the Locker's CRATES tab
  calls "openCrate" (spend one, then reelCrate's own bumps and CrateLoot.grant, so the odds
  are the web's, rolled at opening). reelCrate itself is untouched for the parity replay.
  THE MOMENT (game/crate_surface.gd), on the water beside her, no strip of prizes: a reeled
  crate breaks the surface (the waterline cut tweened up, spray, a ring) and is hauled
  aboard; an opened one surfaces, strains at its lid (longer and harder by tier), and
  bursts: a bloom in its colour, its own spray (wood splinters, metal sparks, gold glints,
  diamond frost, the ancient chest's motes rising), a ring, and the prize rising on a paper
  tag; a rare find gets the full-screen reveal on paper; then it settles back under.
  CrateMoment survives only as the tiers, art and loot wording. THE CAST BUTTON is a
  watercolour seal (fx/seal.gdshader): torn paper, a ring of the action's pigment pooled
  at its edges, inked hairlines, the word inked on the face, a wet ring on a press.
  SUPERSEDED the same day (Kong did not like the seal either): CAST AND REEL IN ARE
  LETTERING ON THE WATER (game/dial_button.gd, still DialButton): the word in Cinzel under
  the boat (sea-light to cast, warm gold to reel, dim when it cannot be pressed), a small
  SPACE key beside it, a soft stroke of light under it that swells on hover and flashes
  on a press; hidden while waiting (the waiting cues say it). The reach pill moved down
  to just above the bottom row. fx/seal.gdshader is gone.
- THE REEL, PASS ONE (2026-10-01; Kong: "make it feel really good, it's the core
  mechanic"; items 1-3 of a nine-point plan, the rest offered for later: accuracy tick,
  bobber anticipation, the dial nearer the line, zone-edge clicks, a 60-80ms strike hold,
  low-latency display). THE FIGHT (game/reel_fight.gd) fills the old still hold
  (HOLD_S 0.62 / HOLD_PERFECT_S 0.9, unchanged) where the line goes in: the boat keeps her
  waiting pose until it ends (her line is painted in her sheet, so a drawn line would
  double it), the fish's shadow thrashes and rises in the under-water layer with the
  water boiling over it, the rod nods. Perfect: the fish (its own art) leaps out in an
  arc and drops back, a splash each end. Catch: a splash. Miss: the shadow darts off.
  Snag: the rod springs. EVERY PRESS ANSWERS: Sound.slack (miss), Sound.snap (snag),
  Sound.reel_clicks (a ratchet run under a catch), all synthesized. THE STREAK, HEARD:
  Sound.streak(n) on a perfect, a step up a pentatonic scale per perfect in a row, with
  a flourish at 5 and 10, fired on the press with the perfect. Boat.splash takes a place.
  The needle and its freeze are untouched (never backwards).
  THE LINE IS LIVE (same day). It was painted into every captain sheet; setup.mjs deripple
  v4 keeps only each sheet's largest connected shape (the captain and hull; the line and
  its hook were always a second, separate shape) and clears near-transparent dust.
  game/fishing_line.gd (built by Skipper for any captain with a rod) draws it from the
  rod tip in the captain's space, using tip/end points measured off the painted line
  before it was cleared (identical on every colour's sheet): rest hangs and sways with a
  small drawn hook when none is worn; cast flies out whipping over 0.45s; wait runs into
  the water; in a fight it runs to Skipper.line_target (a global point), taut and humming,
  or bows slack (line_slack), or snaps (line_snap_t). ReelFight now draws the fish in
  toward the hull on the line again, and the leap carries the line up with it.
  THE LINE FLOWS (same day, Kong: "as natural as possible"): the hook rides the line's end
  (the worn hook's art cut from its sheet, region 244,366 37x75, turned along the line;
  Skipper no longer places it). On every pose change the line's end eases from where it
  was (Skipper.line_from / line_end_prev) to the pose's own place. THE CAST throws the
  hook up over the tip and out along a curve through a point high beyond it, landing
  exactly where the waiting line enters the water (Skipper.sheet_point("wait", ...) with
  shift_for, the hull-holding shift each pose gets), so cast and wait are one movement.
  The line runs on Skipper.line_clock (game time), not the wall clock.
  THE REEL, PASS TWO (Kong: "fix all those"): the BOBBER NIBBLES twice before a bite
  (~1.15s and ~0.5s out, on waits long enough; Boat.nibble: the line's end dips, a small
  ring, Sound.plip) so the bite is a payoff; the DIAL sits beside where the line goes in
  (placed each frame from boat.hook_at() on screen, clamped), so needle, strike and fight
  are in one place; the PERFECT FLASH blooms about the dial (Fx.PerfectFlash.at), not across
  the screen; HOLD_PERFECT_S 0.9 -> 1.15 so the leap lands before the card; the catch
  splash rings are smaller (field 160/115, ripple 105/80).
- THE LEVEL-UP, REDRAWN (Kong: "I hate the way they look"): the web's navy wash, turning
  rays and rings through the words are gone. The sea stays under a light dim; FISHING
  LEVEL and the number lettered above her boat over a soft warm glow, counting up with a
  plip per level, a stroke of light drawing out beneath and a few motes rising; what it
  brought and any water opened on a paper slip below her boat; the cast lettering steps
  aside while it shows.
- THE LEVEL BAR, CENTRED AND ALWAYS THERE (Kong): top centre of the screen, measured and
  centred whatever it says. It follows the side of the reef (as the web's spine panel):
  FISHING in the fishing waters (with the streak flame and the next level reward),
  NAVIGATION north of the reef (expedition_xp on navXpTable, no flame), crossing over
  fades it out and in on the other skill. Nav bead and line in warm amber.
- XP YOU CAN FEEL (Kong): XpBar.gain sends motes from the catch into the bar, which fills as
  they land (ticks); near a level it warms, crossing one it runs to full and flashes; the
  XP line names the streak multiplier; a "this trip" tally fades under the bar.
- LEVELS GIVE UPGRADES AND UNLOCKS, NOT MONEY (Kong; port_rules.json "_levels"): no level
  pays doubloons or gems (gems are being retired); the hold is raised free at Fishing 10,
  20, 30, 45, 60 (levelRewardMax 100); navUpgrades raise the hull (Nav 10, 25), rudder (15)
  and rig (20) free via the port-only "levelFloors" action, run after each level claim;
  the lantern and the top tiers stay bought. The Shipyard marks free tiers ("Free at
  Fishing 30 · or 8,000 ⟡"); the level-up slip lists Stronger / Unlocked / Earned
  (LevelUp.gains: catch zone, streak ceiling, hold, waters, gear for sale, looks, Master).
- EVERYTHING BOUGHT IS TIED TO A FISHING LEVEL (Kong, RuneScape style; fishing only for now,
  the ship's bought tiers, lantern and boats wait for Navigation): port_rules levelGates,
  read by Rules.gate / gate_block and checked in the rules (buy_bait, upgrade_fish_hold,
  buy_special_item, Portal.buy_tier). Bait: Minnow 5, Night Crawler 15, Chum 30, Angler's
  Formula 45. Holds bought: Titan 75, Leviathan 85, Kraken 95. Auto Caster 25. The portal to
  a water needs that water's level. Rods, reels, hooks were already gated; lines are free by
  level. COSMETICS HAVE NO LEVEL GATES: their gate is the crate, which drops by water. BOATS
  COME ONLY FROM FISHING CRATES: the ten boats that were sold are crateOnly and in the crate
  cosmetic pool with bands (oak, cherry, desert, mahogany common; pistachio, taupe,
  periwinkle uncommon; golden rare; ethereal, chromium epic). The shops show locks; the
  level-up lists what each level opens.
  THE SHIP ON FISHING TOO (Kong): shipUpgrades (replaces navUpgrades, Navigation cannot grow
  in the port) gives the hull's 2nd tier at Fishing 10 and 3rd at 25, the rudder's 2nd at
  15, the rig's 2nd at 20, free; levelGates.ship gates the bought tiers (hull 4th 45, 5th
  60, 6th 75; rudder 3rd 35, 4th 55; rig 3rd 40, 4th 60; lantern 2nd-5th at 10, 25, 45, 65),
  checked in Shipyard.buy_tier; the Shipyard shows "Fishing 45 · 20,000 ⟡" and locks.
- THE FISHING HUD, TIDIED (Kong): the DIAL is centred over the boat (270 px, above her, clear
  of the Reel In lettering; toasts move under the boat while it is up and the top line is
  cleared on a bite) and its FACE IS DRAWN like the Locker's gauge (cream disc, ink rim and
  ticks, clean zone bands, the zone under the needle full; fx/dial.gdshader no longer
  shown). The BOTTOM ROW is three: Bait (press to put on the next bait held; Q for the
  wheel), Locker (I: gear, hold, crates, log), Hold (opens it in the Locker). The LEVEL BAR
  is larger and brighter over a soft dark pool.
- (Kong, same day) THE LINE IS A ROPE: fishing_line.gd simulates 20 verlet points in world
  space (gravity, length constraints, the rod tip pinned, the far end held by the thrown
  hook / the water point / the fish, free at rest with the hook's weight), kept on the
  Skipper across poses (line_pts/line_prev), reset after a jump, damped harder while held.
  THE LEVEL-UP shows pictures of unlocked rods, reels, hooks, bait and looks as tiles, sorted
  Stronger / Unlocked / Earned, and only reports the streak ceiling when it moved as shown.
  THE BAIT BUTTON shows the bait on the line and opens a picker of every bait aboard
  (pictures, counts, what it does); the old press-to-cycle remains as _cycle_bait. THE
  LOCKER tags only the chosen slot, and has a BOAT tab (after Loadout): her hulls from crates
  to wear, and her fittings (reading, pips, how the next tier comes: free at Fishing N, or
  Fishing N then the price at the Shipyard). ShipyardRoom._value/_gain/_cost are static.
  Then (Kong): the Locker has NO tags or lines on her at all; the line ties on at the hook's
  EYE (HOOK_EYE 28.5,7, the hole at the top of the art) and is finer (0.55; thicker in
  portraits, which shrink it); calmer water at rest (wake rest rings every 3.4s at 60%,
  their height 2.4 not 4.5; the line's rings every 1.9s, the bobber's 2.6-4.6s); the ZOOM is
  shown as it changes ("Zoom 120% · default 100%", bottom right, fading); the title's
  PORTRAITS are drawn at 3x and shrunk (sharp) and framed so the hook hangs inside; the
  STREAK FLAME is a smooth three-layer teardrop that flickers, a faint ash outline at none.
- NO CATCH CARD (Kong): a catch is a small paper note floating up over the boat (the fish,
  name, rarity, size, Perfect, and news: golden, new species, personal best, trophy) that
  fades while the fish flies to the hold; misses, snags and stowed crates are toasts. The
  card remains only for a wormhole (a choice). Phase stays "result" (Cast Again at once).
  The BOTTOM ROW is Bait, Locker ("Your loadout"), Log (a pulsing dot for a new species,
  personal best, trophy or golden; also lit on opening if the Almanac has new entries,
  cleared when the Log is opened), Hold. FOCUS: on a bite the dial sits centred (320 px)
  and a veil dims the sea and HUD behind it (Reel In stays bright); it fades out 0.22 s after
  the strike so the fight plays in view. ZOOM: Sea.ZOOM_DEFAULT 0.87 is the default and
  reads 100% (moved 2026-10-02 to 0.55, Kong: the old 100% was too close; the range is now 0.35 to 1.6 and the remembered zoom is "sea_zoom_2"). THE LINE IN THE FIGHT: the fish pulls at 6.5 Hz not 16, no hum, harder damping
  when held, and the hook is reeled up to where it hangs over 0.5 s before being let go.
- STAT MILESTONES (Kong): port_rules statMilestone 10. Rules.level_catch_bonus gives the
  catch zone in steps (+2 degrees at 10, 20 ... 100; the web's floor(level*0.2) otherwise)
  and Rules.streak_level_scale reads the last milestone, so the full-streak ceiling steps
  (x1.37 at 10 ... x1.80 at 100). Totals at 100 unchanged; a captain between milestones
  holds the last one's value. The level-up's Stronger lines follow.
- SKILLS (Kong, 2026-10-02; port_rules "skills"): free, permanent, by Fishing level. THE
  RULE: a skill saves time or shows information. It NEVER touches catching (bites, rarity,
  catch zone, crates, size); that stays with gear and items. Kong rejected bottle/dig
  spotting, wider fog reveal, open-all crates, an extra trader deal and a teleport to any
  port (weak, and the last clashes with the Homestead portal). The list: Merchant's Eye 2
  (the Hold shows today's Market price and its hourly direction), Set Course 14 (GPS on the
  chart; locked below it), Storm Glass 22 (the forecast), Full Sail 33 (full sail 1.25 not
  1.15; boat.set_fit), Autopilot 41, Quick Sell 45 / 70 / 95 (the whole hold from anywhere
  at 65 / 90 / 100% of today's Market price, port action quickSellHold; Kong's call that at
  70+ it beats the zone buyer), Market Sense 49 (every salter buying today marked on the chart,
  with its rate; WorldMap._salters),
  Sky Reader 55 (two fronts ahead, drawn as roads), Second Recall 58 and Quick Recall 75
  (Portal.recall_plan: two recalls per period; the period halved; the port keeps the earlier
  stamps in <col>_log). Levels 76-94 and 96-100 are open for more. Rules.has_skill /
  skill_block / quick_sell_rate; with no skills table (web_only) nothing is locked.
- THE LEVEL SCHEDULE (Kong, 2026-10-02: "an unlock every few levels keeps the dopamine
  going"): something on every level 2-60. Free hold tiers moved to 13/23/33/43/53 (holdFloor
  null at 10/20/30/45/60); free ship tiers to 8 hull, 17 rudder, 27 rig, 38 hull 2, 47 rudder
  2, 57 rig 2; bait bundles added at 31, 39, 46, 51, 59 (21 already had one).
- THE FISHING GUIDE: Locker tab Levels (pressing the level bar opens it): every level and
  LevelUp.level_lines(n) for it, passed ticked, the next in red, the rest grey; or the
  skills alone. The level bar reads "Next at N: X" (LevelUp.next_unlock) and the level-up
  slip ends with it. Skills show on the level-up as "Learned".
- WEATHER IS FRONTS (Kong, 2026-10-02; the web's squalls are GONE from the port, and their
  parity check with them). core/weather.gd: 36-minute slots, each maybe one front, hashed
  from the slot (every captain and Charter sees the same sky). A front sweeps across the
  whole chart in 4 minutes and sits on any water 12-24 minutes. Kinds: Rain Squall (-10%
  speed), Gale (-18%, heavier turning), Tempest (-25%, lightning), Fog (a veil, thick toward
  the screen's edges; fx/fog_veil), Fair Wind (+/-12% with or against it). It changes the
  look and the sailing ONLY, for now: Kong wants weather and day/night to nudge which fish
  bite, to be discussed. The water shader's cloud reads u_front (direction, lead and trail
  edges). The chart shades the front and lists it (Storm Glass), and draws the next two as
  dashed roads (Sky Reader); without Storm Glass it tells only the sky over you.
- A REAL DAY (Kong, 2026-10-02): SeaClock.sky(now) puts the sun on a path, east at sunrise,
  across the NORTHERN sky (the top of the screen, so noon shadows fall toward the viewer,
  as the painted art is lit) to the west at sunset; the moon takes the same road at night,
  lower (elev x0.75) and its shadows at 40%. It drives: the water's u_light (glints, moon
  road, island shadows marched through the SDF, reach 300 to 60 by height), u_sun_h and
  u_shadow; the DirectionalLight2D on the land's normal maps; every hull's shadow
  (Skipper.sun, an offset away from the sun, 30 to 5 world px); the golden-hour glow, now on
  the sun's side of the sky; the day's tint (warmer and dimmer as the sun lowers). Shadows
  fade as the light nears the horizon, so the sun-to-moon hand-over at dusk and dawn is never
  seen. The HUD's phase words became a sea time (sunrise 6 am, sunset 8 pm) with a small arc
  showing the sun or moon. LOOK ONLY: SeaClock.at()'s night is unchanged, so night-only
  traders, music and lanterns keep their timing. Boat REFLECTIONS stay straight below each
  hull (a mirror follows the viewer, not the sun).
  The lantern's column on the water only shows once it is properly dark (it read as the
  sun's at dusk); the sun has its own glitter road toward where it stands, strongest low.
- THE MARKET DAY (Kong, 2026-10-02: "simplify the market; prices change every game day"):
  port_rules marketTickMs 2,880,000 (a sea day) and marketTickOffsetMs 1,920,000 (sunrise);
  Market.tick_ms / daily / next_tick_after; each day's mood lasts the day. Under web_only it
  is still hourly. The Advanced board needs Fishing 50 (levelGates.feature.market_advanced).
- ROOMS BY FISHING LEVEL (Kong, 2026-10-02, SETTLED; the rooms are not ported yet; apply
  through levelGates and the Levels guide when they are):
  - The Den: Fish Slots at 1 (the Catfish Jackpot is part of it), Roulette at 10, Blackjack
    at 20. There is NO Crown & Anchor in the game.
  - The chip purse's daily buy-in: 1,000 to start, +1,000 at 10, 20, 30 and 40 (5,000),
    7,500 at 70, 10,000 at 100.
  - The Parlor: the Captain's Board from 1, holding up to 3 cards, 4 at 30, 5 at 60; the
    Pirate King ladder at 25.
  - The Chart Room: one puzzle type opens at each of 1, 10, 20 and 30.
- THE DEN, RULES (2026-10-03): core/casino.gd ports lib/core/casino.ts with casinoRules,
  roulette, blackjack and the local store's casino (the purse and its daily cap, buy-in and
  cash-out, Fish Slots, roulette's whole bet slip, blackjack with insurance, splits and
  doubles). Parity: three scripted sessions, 2,393 calls (600 spins, 400 roulette slips, 500
  hands, every refusal). Port rules (port_rules "casino"; tests/den_check.gd): the fixed 300x
  Catfish Jackpot (no pot), the trimmed table, the cap by Fishing level, roulette at 10 and
  blackjack at 20. THE RETURN IS ABOUT 90%, NOT 88.6%: exact enumeration of the settled table
  gives 89.6% at 10 chips to 90.1% at 100 and up (pairs round down); the 88.6% in the
  proposal above was a slip.
  THE ROOM (Kong, 2026-10-03: "match our game; use Godot for better animations and smoother
  play"): game/den_room.gd, a door on the dock. A paper strip holds the purse (chips, what is
  left to buy in today, +100/+250/+500/+1,000, cash out; the chip number counts up and down);
  a tab per game (closed tabs say "Needs Fishing 10/20"). FISH SLOTS (game/den_slots.gd): a
  stained-wood cabinet with three paper windows; the reels run a long strip smeared with
  speed, land one after another with an overshoot and a knock; the line that pays glows;
  three hooks spin the bonus round; three catfish light every window and throw gold. The
  hook symbol is a painted brass hook (web/public/den/hook.png, Kie.ai). FISH ROULETTE
  (game/den_roulette.gd): a wooden wheel in the real order, the ball running the other way,
  dropping and rattling into its pocket, the pocket's fish rising in the brass hub; a paper
  board (numbers, dozens, columns, the even bets) where chips stack; Same again; the last ten
  numbers as beads. BLACKJACK (game/den_blackjack.gd): paper cards slide in from the shoe,
  the hole card turns over at the end and the dealer draws one by one; Hit/Stand/Double/Split
  (H/S/D/P), insurance on an Ace; a hand left open comes back. Splits, streets and corners
  are not on the roulette board yet (the rules take them).
  THE DEN WITH THE CREW (Kong, 2026-10-03: "in a Charter, anyone should be able to join in on
  roulette and blackjack; quick, easy, fun with friends"): game/den_tables.gd, a node under
  CrewNet on every game; the founder's runs the tables. A table action is the op "denTable"
  ([game, action, payload]), caught by Charter.run before the rules, so a crewmate's goes the
  usual way (CrewNet.request) and the founder's own too. After every change the table is sent
  to everyone (rpc, call_local); chips stay each captain's own and move only through
  core/casino.gd (spin_roulette takes the shared number), then the saves are spread and the
  file written. ROULETTE: sit by opening it; one board shows everyone's chips in their seat
  colour; Ready (not Spin); it spins when everyone at the wheel is ready or 20 s after the
  first ready; one number settles all; every captain's net is called out. BLACKJACK (game/
  den_blackjack_table.gd): up to four seats, one dealer and one shoe; bet and Ready (deals
  when all are, or 15 s after the first); turns in seat order, 30 s each before a stand is
  taken; double and split as solo; NO INSURANCE at the shared table (a dealer's natural is
  seen at once); everyone is paid at the end. Outside a Charter the games are the solo ones.
  tests/den_tables_check.gd: a Charter with two captains, 12 spins and 40 hands, every chip
  accounted for.
  REAL CHIPS (Kong, 2026-10-03: "actual chips that get animated, different stack tiers; seeing
  the chips add to your stack"): painted wooden tavern chips from one Kie.ai sheet so they
  match (web/public/den/chip-10/25/50/100/250/500: bone, coral, sea blue, kelp, charcoal,
  purple), keyed by distance from pure magenta (the usual hue key ate the purple), and four
  stack tiers (den/stack-1..4: a short stack, a tall one, two, a heap). DenRoom: your stack
  stands by the chip count and changes tier as it grows (under 500, 2,500, 10,000, then the
  heap) with a pop; fly_chips() sends an amount as chips (biggest first, up to 14) arcing out
  of the stack to a bet or back into it from a win, each landing with a tick and the stack
  giving under it. Used by every game (a slot's stake and wins, each roulette chip placed and
  every winning spot paying back, blackjack's bet and its return, solo and at the shared
  table). The roulette board draws the painted chips (the others' ringed in their colour).
  GOTCHA: a texture first loaded inside _draw is white until the next frame; load ahead.
- THE BATTLE ENGINE AND THE FIGHT ON THE WATER, FIRST SLICE (2026-10-03; the settled shape is in
  the co-op combat section). RULES: core/battle.gd, one engine for parties (solo a party of
  one), on the web's numbers: the aim bar's judgment (crit 0.012 / hit 0.06 / graze 0.038 half
  widths, inclusive), raidDamageProfile and rollShotDamage, initiative (d20 + speed, ties to the
  ships), the dodge contest (d20 + Navigation against d20 + accuracy, ties to the dodger, a
  failed dodge still cuts to 30%), pickEnemyAction (pattern, reload substitutions, the 30%
  feint, snare jams, never two dodges), specials and ultimates, phases (revive at revivePct),
  mechanic checks (any captain's crew order answers; a failure lands on every ship), statuses,
  shields, the Vengeance ward, and every crew class's order by milestone (a heal, shield, brace
  or ward may go to a crewmate). The enemy's TARGET is a ship it picks as it fires (hidden).
  EVERY CAPTAIN KEEPS THEIR OWN SHIP, HP, crew and balls (Kong checked: "it should still be your
  individual boat"); only the ENEMY scales. PARTY SCALING (port rules battle.party): the enemy's
  HP x1 / 1.8 / 2.5 / 3.2 (enemyHpMult), and an ordinary attack is 1 / 2 / 3 / 4 AIMED shots,
  each at a ship it picks as it fires, hidden, and it may pick the same ship twice (focus), so a
  captain can be focused down and a crewmate's heal or shield matters. BROADSIDES (Kong,
  2026-10-03: "certain enemies should be able to hit all players at once, and bosses all have
  that ability for some of their hits"): every boss's volleys and ultimates, and the volleys of
  the enemies in battle.broadside.enemyVolleys (the Saltwater Corsair for now; more as raids are
  ported), hit EVERY ship at once, each with its own dodge; on the water a "Broadside!" call and a
  ball fanning out to every ship together. tests/battle_check.gd, Pete's raid, a fair bot, 300
  runs a size: 38% / 41% / 63% / 73% won. (Tried and dropped: one shot a round, and aimed shots
  spread one to a ship: either co-op won nearly every time, or it was the same as hitting all.)
  (Everything this slice left out is built below.)
  Crew.leveled_stats ports crewLevel's stat ticks and resolveDeployedCrew. SEATS: Crew.assign
  (assignToRaid / assignToVoyage / benchCrew, parity: crew.json "the party seats").
  REWARDS: core/raid_run.gd (awardRaidKill's XP and doubloons, crew XP to the seated hands, the
  boss's crate: 300 to 600 times Fortune and each item rolled by rarity; PORT RULE: the crate
  always pays coin, gems retired), raid_clears in the profile.
  THE FIGHT (game/battle_stage.gd): the sea BECOMES the battle screen. She sails out (through
  the Sea Gate for now) while black bars slide in, the sea's HUD falls away and the deck rises;
  the enemy is a real hull (game/hull_rig.gd, the expedition ship's waterline, collar and
  reflection) sailing in from the right with its portrait over the masthead; nameplates over
  every hull (HP, shield, balls, statuses). The deck: Fire, Volley, Reload, Dodge (1 to 4), the
  balls, the crew's orders as cards. Fire or Volley swaps in the aim bar (game/aim_bar.gd: the
  web's needle and drifting zone, judged raw where the needle is). A round plays as a show: a
  crew order's card rises with its colour and its effect lands on the water; the turn strip
  lights each ship as it acts; cannonballs arc (game/battle_fx.gd: muzzle flash and smoke,
  splashes and rings in the sea's field on a miss, splinters, fire and smoke on a hit, bigger on
  a crit; Sound.cannon and Sound.impact, synthesised with a new noise voice); numbers rise off
  the hulls; a sunk hull goes under its own waterline (the shader's cut climbs); the next enemy
  sails in; a Rest Stop refreshes the orders; the crate at the end; sunk, she sails back to the
  Gunwharf. THE GUNWHARF (game/gunwharf_sheet.gd) seats the raid party. The class picks now
  count in a fight (Battle.seat_for: hpMult, speedFlat, damageMult; RaidRun: doubloonMult on
  kills and the crate), and a clear is a raidClears row with its time (raidLocal addClear); the
  Reef Skirmish sets has_completed_practice_raid instead (recordSkirmishClear).
- THE ENEMIES' WAYS, TIDES AND RAID ITEMS, BUILT (2026-10-03; core/battle.gd, core/armory.gd).
  ENEMIES: affixes (a named hand's baked one; a challenge run rolls two elites with one each,
  HP x1.5 and damage x1.25; the Quartermaster's challenge merges a second onto every baked
  one), Carapace (a slice off a single shot), the riposte (a parry that cuts back; the Riposte
  affix), the shark's bite (a landed shot knocks a ball loose), aim afflictions (the zone's
  speed stack up to x4, a drifting crit seam, fog, a false court of decoy bands where locking on
  one fumbles for a chip of hull, iron shutters the first press only cracks, a squall pitching
  the needle), the flare barrage every third turn (a swatting game: real flares on fuses, live
  iron shells at tier three), a boss's off-turn ability once a phase two to four turns in (the
  Maw's lunge, the Wake's flurry at every ship, Old Armour's heal and barrier, foresight, the
  vengeance ward that holds it up once at a fifth and then hits a quarter harder, the requiem's
  mark on every ship), the Last Wall (blows only crack it; a volley twice), phase mitigation,
  burn and freeze both ways, Ironclad, Vampiric, Volatile, Fleet, Frenzied, Reflective,
  Resilient, Marksman, Scorching, Glacial, Warded, Yawing. TIDES: drawn at the start
  (drawTides), offered after the slotted kills, EACH CAPTAIN CHOOSES THEIR OWN and the effects
  ride on their ship (the ones that shrink the next enemy multiply across the line); the
  Throne's reprieve before the don. RAID ITEMS: the Gunwharf's Armory tab (mounts, the hold,
  conflicts) and Refits tab (the Sixth Berth, the Expanded Armory); saveEquippedRaidItems,
  buySixthBerth and buyArmoryExpansion ported with parity (campaign.json "the armory"); every
  effect type in a fight except the Primeval Maw's charged ones; the Quartermaster repossesses
  one item a fight; the drum family's rally is a free action (key 5). The boss's pre-fight
  words play over the water as a scene. A bot with a late loadout clears the campaign's raids
  except the Throne and the Hand (tests/battle_check.gd). FLEE (key F): the web's d20 against 10
  plus the enemy's speed (3 more for a boss), a 20 always away and a 1 never; a miss takes a
  parting shot; away, she keeps what she earned. THE MEGA: the Man-o-War's ultimate built at the
  Gunwharf's Ultimate tab (getUltimateState, startUltimateBuild, swap, retool, the Full
  Schematics, switch; parity, campaign.json "the ultimate"); in a fight key 6: the Railgun's
  lance of light pierces barriers and a clean dodge only grazes it, the Barrage's four blows each
  roll the on-hit gear, the Nuke's blast leaves the wreck burning, and only a Mega breaks the
  Last Wall. KONG 2026-10-03: the Mega waits for the gauntlets: its fourth gate, the Extra
  Cannonball Rack, is sold only in the Gauntlet's Locker, so it shows as missing until then.
  THE PRIMEVAL MAW rides charged (borrowed_jaw#level) with its milestone's fire, volley, Mega
  and boss damage, the opening ball and the free crit. NAVIGATION RENOWN in a fight and its pay:
  Might, Bulwark, Plunder, Command.
  THE LOOK (Godot over the web): fire on a hull (flames, embers, smoke, a warm light on the
  water), a frost crust and ice shards, a dome of light for a shield, the ward's runes turning
  on the water, foresight's eye over the masthead, the Last Wall as iron plates rising from
  the sea that crack and burst, the boss's summon breaching beside it in its colour (cut at the
  waterline) and lunging, the flare sky, the tide card, and the battle deck on the night paper.
  THE TWO PAPERS, FINISHED: Pane.set_night repaints the whole HUD on the night paper north of
  the reef (Pane "night" specs, Kit.night_ink for words written in day ink); anything added
  later under it lands on the night paper too.
- CO-OP RAIDS OVER THE CHARTER, BUILT (2026-10-03; game/raid_table.gd, game/raid_muster.gd).
  The founder's game runs the fight (a host-run table like the Den's: action `raidTable`, caught
  by Charter.run, every state sent to all aboard). THE MUSTER: a captain calls a raid from its
  hull; a card at the top of everyone's sea (night paper) shows the raid, who is aboard and a
  25s count; Join (only a captain whose own map has reached that node; up to four), Stay
  behind, and for the caller Sail now or Call it off. A ROUND: every captain in the fight
  plans on their own deck (their own aim bar) and the top bar counts 30s; a captain who has
  not chosen reloads (or braces when full); a flee goes in as a plan and its die shows when
  the round plays. Every screen plays the same events from its own seat (BattleStage.me) and
  says when it is done (or 25s) before the raid moves on. A heal, shield, brace or ward
  (mender, abyssal tide, anchor, vengeance) gets a TO row to aim it at a crewmate. Flares and
  tides are each captain's own. PAY: each kill pays every captain still in the fight, through
  the Charter's book (lent, earned, taken back, noted under the captain's name), so the coin
  goes to the crew's purse and the XP is each one's; each captain's own crate and clear at the
  end. A captain sunk or away leaves the screen ("out") and the rounds stop waiting on them.
  IN A CHARTER EVERY RAID, EVEN ALONE, GOES THROUGH THE TABLE (Sea.raids_shared), since a solo
  fight's pay would land in the captain's own save and not the purse. The line: seat 0 at the
  dock, the others astern to port and starboard; the frame fits every ship. Crewmates' boats on
  the sea now become their expedition ship north of the arch, as yours does (North.ship_art,
  HullRig.turn; the look carries shipTier and shipSkin). tests/raid_table_check.gd (a muster
  with a refusal, a raid played to its end, both paid, a flee paid nothing after);
  tests/shot.gd "coop" (COOP_STEP muster / plan / target / wait / round, states fed by hand).
  KONG 2026-10-03, AFTER A LOOK: a captain must be AT the raid to call or join it (within
  RaidTable.NEAR, 1400, of its dock; the founder's game checks the position sent); NO CLOCK on
  a round or a tide (it waits for every captain; a game that drops leaves the line, paid nothing
  more); every ship in the line faces the enemy (Boat.face_to, Shipmate.face_lock). WHILE THE
  CREW PLAN each ship's plate shows its committed order: the action, where its aim landed (a
  critical in gold), and a crew order with who it is for. CROSSFIRE (skill based, Kong: "only
  when both parties hit a critical"): two or more ships landing a CRITICAL on their own aim bar
  in the same round; each of those shots x(1 + 0.25 per crit past the first) (port rules
  battle.crossfire.pct). A hit turned crit by gear or a tide does not count. On the water: a
  "Crossfire!" call, gold lines from each ship to the enemy; while choosing, "Ben landed a
  critical. Land one too for a crossfire." NOT YET TESTED over a real Steam lobby.
- THE FIGHT'S LOOK, OVERHAULED (2026-10-03; game/battle_look.gd). Kong: the fight UI and the
  plates "look a bit elementary"; then "still in the similar style as what our overall theme
  is", "use the players profile pic ... like how the leaderboard on the web game displays the
  profiles", and, of a brass-trim pass, "I don't like the brass trim aesthetic. I like the flat,
  clean aesthetic look that we have still in the game." SETTLED: FLAT AND CLEAN in the night
  side's browns (solid fills, one faint hairline, rounded corners, a soft shadow at most; NO
  rims, gloss, sheen or flourishes); colour carries meaning only (green your line, red the
  enemy, gold a critical, the lead order or what is chosen). PLATES: the captain's own avatar
  (game/avatar.gd, CharacterAvatar, rendered once to a texture per seat; the seat carries face
  {characterColor, hat}) or the enemy's portrait in a ring of its colour, a BOSS / ELITE / YOU
  tag, a flat health bar with a pale trail that drains after a hit, the shield as a thin bar
  over it, cannonballs as flat discs, status pills; the acting ship's plate takes a gold
  hairline. TOP BAR: the raid's title over its fights as dots (this one gold, the boss's red),
  the initiative order as avatars on a line (the one acting ringed in gold), "Choosing: ..." in
  a pill. THE DECK on the night paper, as tall as what is on it, tucked under the bar while a
  round plays; each order a flat tile with a drawn icon, its cost and its key; the shot rack;
  crew orders as cards with the hand's portrait in their class colour. The aim bar flat.
  Words landing on one spot stack instead of overprinting.
  THE STAT CARDS (Kong: the first cut "looks super AI especially with the accent color strips";
  redesigned). Both are a DOSSIER (game/dossier.gd), set like a page, not a dashboard: LEFT, the
  art large on a flat disc of its colour (the enemy's painting with a shadow under it, its ship
  if it has no portrait; a captain's ship with their avatar set into the corner); RIGHT, a quiet
  lead-in line ("Boss  ·  The Throne, fight 7 of 7", "Your brigantine"), the name in Cinzel, the
  hull as one wide bar (shield over it), the numbers as figures over small words with
  hairlines between, then sentence-case sections of entries (a name, what kind of thing it is
  in faint type, a line of description). NO accent strips, icon tiles, tinted boxes or
  all-caps eyebrows. Colour only for meaning (red harm, green help, gold the answer to a
  telegraph). THE ENEMY'S CARD (game/enemy_card.gd, RaidCombat's EnemyStatsPopup): click the
  enemy's hull or plate ("CLICK FOR STATS" under it until opened once). What it does (an
  elite's affix, Carapace, Mist Veil, Rolling Plate, the riposte, Shark's Bite, its special,
  its ultimate, Signal Flares, in the web's words); a boss's phases as a timeline (back at what
  hull, how much harder, the telegraphed move and, in gold, what answers it); right now (the
  Last Wall, statuses, burn, freeze, snare, the ward); how it fights. THE CAPTAIN'S LEDGER
  (game/captain_card.gd, PlayerStatsPopup): click your plate, or a crewmate's in a Charter's
  raid. Damage, crits, initiative, evasion, fortune; the ship's class as chips; the gear
  aboard and the Mega; the tides taken this raid (the seat records tidesTaken); the crew's
  orders and which are spent; right now (statuses, burn, freeze, ward, brace, an aim
  affliction, a repossessed item). KONG: the boss's crate odds are NOT on the card; they belong
  to the raid's entry screen.
- THE FIGHT SYSTEM, UPGRADED (2026-10-03). KONG: statuses "introduced earlier than it is today"
  (they first came at the Blockade, chapter 4), more for co-op ("enemies can also shield one
  another or heal one another or inflict statuses like blinding players"), and "we're no longer
  doing anything with the web at all": THE PORT'S RAIDS ARE ITS OWN NOW (port rules
  battle.enemyMods lays the port's changes over a raid's hands; Battle.enemy_def). KONG'S CALLS:
  every tier including solo; aim statuses Blinded and Narrowed; support moves INSTANT (no
  telegraph); roles on co-op fields only.
  EARLIER STATUSES, one new idea a raid, each a status special IN PLACE OF ONE OF THE HAND'S
  DODGES (not a reload: that starved its shot and turned a volley the pattern promised into a
  reload, wrecking the rhythm players read, which cut the fair bot from 35% to 17% on Pete; not
  an extra turn: a free breather made Pete easier, 49%): Pete's raid, the Corsair's Rusted Chains
  (Feeble) and Barnacle Pete's Barnacle Crust (Fortify); Krust, the Hull Breaker's Ram Home
  (Weaken), the Overseer's Lash (Slowed), Krust's Shell Up (Fortify); the Cartographer, BLINDED
  (the Sounding Hand's Ink Cloud, the Cartographer's Squid Ink); the Tollmaster's Cut, NARROWED
  (Snapjaw's Jaw Clamp, Spet's Toll Due) and the Exactor's Levy (Weaken); the Coffers, Barb's
  Marked Man and Bristle Up (Enrage); the Quartermaster, the Breaker's Lockdown (Silence).
  BLINDED (aim bar): dark but for a soft window round the needle (mag: its half width).
  NARROWED: every band (crit, hit, graze) smaller by mag, judged the same (Battle.judge scale).
  ROLES (port rules battle.roles), each escort of a co-op field its own; every third of its turns
  (the 2nd, 5th, 8th...) it spends the turn on its role, instantly: SHIELDWRIGHT a barrier (18% of
  max) on its most hurt ally; SAWBONES mends its most hurt ally 18%; HEXER Blinds or Narrows a
  captain for 2 turns; RALLIER enrages its whole line (+20%, 2 turns); BREAKWATER (passive) takes
  a shot aimed at an ally 35% of the time ("Intercepted!"). On the water a beam of light from the
  caster (blue shield, green mend), a violet bolt to the hexed captain, a red pulse through the
  rallied line; the role on the escort's frame and its stat card ("What it does").
  Balance (tests/battle_check.gd, the fair bot now aims worse while Blinded or Narrowed): Pete's
  raid Normal 42/55/68/77% for 1/2/3/4 captains (was 38/40/64/74), Co-op 37/64/52, Co-op
  Challenge 17/34/24. tests/shot.gd: BATTLE_SHOW=aim AIM_KIND=blinded|narrowed; "coop"
  COOP_STEP=role ROLE=shieldwright|sawbones|hexer|rallier|breakwater.
- COMBAT FEEL (2026-10-03; game/battle_fx.gd; Kong: "make combat feel visceral ... cannons and
  volleys and megas ... damage numbers too ... including dodges and reloads"). Every beat an
  anticipation, an action and a follow-through, LOCAL (the hull that fires, the water it lands
  in; no screen shake, per the juice rule): a gun's flash cone, a soft glow and a bank of smoke
  rolling out along the line of fire, a ring at the port; the ball's high arc trailing smoke; a
  hit's flash, splinters as tumbling shards, embers, smoke, the struck hull flinching (leans,
  shoved away from the guns, springs back, flushes red: HullRig/Boat/Shipmate.react); a crit a
  gold shockwave, sparks and a held beat; a miss a column of water falling back. A volley's
  three guns go off down the hull one after another, each with its recoil. The Railgun gathers
  light at the muzzle (Sound.charge) before the lance and a pierce flare; the Barrage four heavy
  shells in a rolling rhythm; the Nuke a shell lobbed high and slow, then a soft white flash, a
  mushroom and shockwaves. A reload lifts a ball and rams it home (a clunk of smoke, Sound.clunk);
  a dodge swerves the hull hard aside in a curl of foam (Sound.whoosh). Flashes are soft radial
  glows, never flat discs. DAMAGE NUMBERS slam in (an overshoot), flash white, drift off the hull
  and up; a critical bigger, tilted, gold on a soft glow with CRITICAL over it; words calmer.
  tests/shot.gd "battle" with BATTLE_SHOW=fx FX_EV (fire, crit, volley, edodge, ecrit, reload,
  railgun, barrage, nuke) FX_S (seconds in) plays one crafted event and captures it.
- RAID TIERS, THE FIELD, AND THE ENTRY SCREEN (2026-10-03). KONG'S CALLS (all four on the
  recommended option): Co-op and Co-op Challenge are two new tiers for two or more captains,
  Challenge once EVERY captain in the line has cleared that raid on Co-op; several enemies at once
  appear on the co-op tiers ONLY (solo raids stay one at a time, as on the web); the tiers pay a
  bigger crate, better odds and, on Challenge, a COSMETIC pennant (never power, no pay-to-win);
  Crossfire on a field needs the criticals on the SAME enemy (focus fire is the skill).
  THE FIELD (core/battle.gd): b["foes"], 1 to 4 ships; b["enemy"] points at whichever is acting
  or being shot (so the old one-enemy rules run unchanged) and every event carries "foe". An
  ordinary fight fields the party's size (40% one fewer; on Challenge 20% one more), the fight's
  own enemy leading with escorts from the raid's crew (on Challenge every escort an elite); the
  boss comes with escorts. No party HP scaling on a field (more ships instead), the boss keeps
  x bossHp of it. Each enemy rolls its own move and initiative (an enemy's place in the order is
  -1 - its index); its ordinary attack is one aimed shot (a boss a smaller volley). A plan carries
  "target"; a target that sinks mid-round passes to the next afloat. The fight is won when the
  field is down. Port rules battle.tiers hold every number. Balance (tests/battle_check.gd, a
  fair bot that always focus-fires, 200 runs a size, Pete's raid): Normal 40/64/74% for 2/3/4
  captains; Co-op 26/57/35%; Co-op Challenge about 10/24/11%.
  PAY (core/raid_run.gd): kills x coin and x xp of the tier, escorts at escortPay of theirs; the
  crate rolls 1 + extraRolls times (each item at most once) with rarities x rarityMult, its coin
  x coin; clears recorded as the raid's and "raid@coop"/"raid@coopc". KONG: NO PENNANTS (removed).
  THE MARK OF COMPLETION (Kong: "a satisfying mark of completion if you've beaten one"): each tier
  of a raid beaten is a gold seal with a check (ReadyScreen.seal): on the entry screen's tier tab
  (your own), under each captain's card (theirs), and in a row of three under the raid's ship on
  the campaign water (Normal, Co-op, Challenge; hollow until beaten). Winning a raid slams a
  "RAID CLEARED" seal down mid-screen with the tier under it (BattleStage.Stamp: the sea dims, a
  ring of light, a thump); the first clear of that tier adds a FIRST CLEAR ribbon and a burst of
  gold (RaidRun.record_tier_clear returns first; the table sends "tierClear"). Normal pays exactly as the web (parity unchanged, the crate's dice in the web's order).
  THE GAUNTLETS (2026-10-03; Kong: "Build it like how we have it but with multiplayer in mind
  ... I want multiplayer coop gauntlet to be amazing. It's the end game coop repeatable game
  loop"). RENAMED: Davy Jones' Gauntlet is now DAVY'S GAUNTLET.
  RULES: core/gauntlet.gd ports lib/gauntlet* (fights, curves, boons, curses, confluences,
  convergences, Terms, Marks, the Fence, the Don's jobs, Davy's Offer, the haul); the tables are
  exported to rules.json (gauntlet); tests/parity/gauntlet.json replays 80 seeded descents
  (3,320 depths) to the same rolls. The haul rolls the web's chase in its order (the Don's
  Palisade is still listed and never rolled, as on the web). PORT RULES: gems retired, so the
  chest's gem bonus is not paid; Locker damage and armour fold into the ship's multipliers.
  NO HARDCORE GAUNTLETS (Kong, 2026-10-03: "I don't think that's needed because we have hardcore
  mode"): the two ways in are SOLO and CO-OP for each descent. With hardcore gone go the Terms
  (they were its board) and Blood Gems from a dive; a hardcore Charter's lives will cover a ship
  sunk in a dive when they are built.
  FIGHTS: core/battle.gd carries every run effect kind the boons, curses, synergies, Marks and
  Terms use (about 60), stacked as RaidCombat stacks them (tide_agg, line_fx for the enemy side,
  finish_check for execute, coup and tithe); raid numbers are unchanged. Battle.begin_gauntlet /
  gauntlet_fight field one ship alone; a party meets its own size in ships (sometimes one fewer,
  rarely one more; a boss one fewer), escorts with co-op roles (port rules battle.gauntlet.party,
  tuned with tests/gauntlet_balance.gd so a crew dives about as deep as a lone captain).
  THE TABLE (game/gauntlet_table.gd): one host-run table for solo and a Charter (op
  gauntletTable). SHARED: depth, pot (each captain banks all of it; each escort sunk adds half a
  mob's pot), curses, Terms (the caller signs), jobs, the vote. OWN: hull, crew, boons, synergies,
  Marks, Locker, Fathoms, haul. THE DRAFT TABLE (Kong): a face-up spread of party size + 2 family
  cards, picked in turn, the order rotating each draft, each pick stamped with the captain's face;
  each card is the next tier for whoever takes it; a private synergy card per captain; the one at
  the table may reroll what is left or banish a card (Blacklist). THE VOTE (Kong): bank or dive
  at every breather; a majority carries, a tie banks. TOWED HOME (Kong): sunk in a fight the crew
  win, a ship rejoins at a quarter hull; the whole party sunk loses the pot. Shrine and Fence
  each captain's own; a job's stake is voted (a tie walks away); each captain takes their own
  Mark. No clocks anywhere. A Charter's table runs one dive at a time (solo or co-op).
  HELD DIVES: every breather writes the dive down (alone in the captain's save,
  gauntlet_held; in a Charter in the Charter's file, gauntletHeld), so a crash picks up there.
  The breather's HOLD: alone it holds at once; together it takes every vote (a vote to hold
  otherwise counts as banking). The entry offers the held dive to resume (its whole crew, and
  only them) or to end (Fathoms paid, pot lost). One held dive per descent.
  RECORDS (GauntletTable._record): across both modes (gauntlet_* / dons_gauntlet_*, which the
  Locker's depth gates read) and per mode (gauntlet_solo_*, gauntlet_coop_*): deepest banked and
  the time to it, deepest sunk, dives banked and sunk, the deepest dive's and the last dive's
  recap (depth, crew, pot, powers, synergies, Marks, curses, the guns); the biggest hit.
  CO-OP'S OWN (Kong, 2026-10-03: "specialize into different helper class builds ... support
  roles or healer or tank roles while others choose more classic damage", "balancing as
  grounded as possible"; port rules battle.gauntlet). BOND POWERS (bonds, 21 families, icons
  in port_art/gauntlet/bonds): dealt only at a co-op draft table, at most one per spread (it
  takes the last card's place, chance bondChance), weighted by rarity like the powers. Roles:
  TANK (Draw Fire, Shield Wall, Lashed Hulls, Covering Fire, Close Ranks), HEALER (Field
  Dressing, Shared Spoils, Surgeon's Hand, Smelling Salts), SUPPORT (Powder Runner, Signal
  Flags, Spotter's Mark, Rallying Cry, Sea Shanty, Boarding Action), GUNNER (Wolfpack, Kill Box,
  Converging Fire, Crossed Guns, Raking Fire, Echoing Guns). The engine (Battle, the bond*
  kinds) does nothing and rolls no die unless a ship holds one, so solo and raids are as they
  were (parity unchanged). CREW SYNERGIES: at a co-op table, a synergy whose two powers two
  different captains hold one each may be dealt (chance crewSynChance); either of the two takes
  it with their pick and both get it, at the lower tier the pair holds (run.crewSyn). CO-OP
  SYNERGIES (bondSynergies; a bond plus a power, one captain or split across two): Iron Bulwark
  (Shield Wall + Ironhide), Field Hospital (Field Dressing + Bilge Pump), Powder Train (Powder
  Runner + Powder Hoard), Death Mark (Spotter's Mark + Executioner), Rolling Broadside (Raking
  Fire + Broadside Mastery), Rally the Line (Rallying Cry + Rising Tide). The Codex lists the
  bonds by role and these apart. A co-op bank adds the FLEET CHEST (+fleetPerCaptain doubloons
  per captain afloat past the first) and SKIN VOUCHERS by depth (vouchers; Bosun's from depth
  10, Captain's from 20; a crew of four banking at fullCrewDepth rolls twice; Fortune lifts the
  odds, capped at 25%). A crew's own record per descent (gauntlet_crews: the deepest these
  captains reached together, and the time). Grapnel Line was CUT (Kong).
  CO-OP PACKS (Kong, 2026-10-03: enemy groups "fair yet more interesting"; roles are fine to show
  because the enemy's card shows abilities; "mixed packs in middle-late runs"; port rules
  battle.gauntlet.packs, Gauntlet.escorts). A co-op field's escorts are ONE FLEET'S CREW (the
  lead's own fleet when it is one of the descent's crews), sized by a THREAT BUDGET instead of a
  ship count: budget by party size (2/3/4 captains), one either way, bossCut fewer under a boss,
  deepBonus deeper; each ship costs by its kind (scout 1, regular 2, brute or sniper 3 ...), +1
  for a role, +2 for an elite affix; at most three escorts. ROLES come from the fleet's own list
  (Krust's crew rally and break water, the Cartographer's hex and spot, the Coffers shield and
  mend ...), at most one support (shieldwright, sawbones, rallier; these sail at supportHp) and
  one other (hexer, breakwater, the new SPOTTER: Marks a captain, every hit lands harder) per
  pack. Raids' co-op fields still deal roles their old way. MIXED PACKS from mixFrom (Davy's 12,
  the Don's 4): two fleets in one pack. COMBOS from comboFrom (Davy's 8, the Don's 3), at most
  one per fight, a role ship and a partner (the lead counts when it is a plain ship), never an
  elite-affix ship: Hammer and Anvil (hexer + a heavy: hexed captains take more), Shield and
  Sword (breakwater + a plain ship it covers more often), Called Shot (spotter + a plain ship:
  more crits on a Marked captain), War Drums (rallier + a plain ship that loads a ball on the
  rally), Field Surgeon (sawbones + breakwater: patched up when it takes a shot). Sinking either
  half breaks it (announced). Shown on the enemy's card (the pack's name, the combo and its other
  half). COUNTERPLAY from the bonds: Boarding Action costs a role ship its next role turn, our
  Spotter's Mark gets a ship past any breakwater, Draw Fire pulls the enemy spotter's mark onto
  the tank, Smelling Salts clears hexes and marks. Solo has no escorts, so it is untouched.
  REACTIONS (Kong, 2026-10-03: "like Magicka ... discoverable Easter eggs for coop"; port rules
  battle.gauntlet.reactions, Battle._reactions; co-op gauntlets only, not raids yet). When
  elements on one enemy ship came from DIFFERENT captains (the ship remembers who laid each:
  e.elBy), they react on the hit that completes the pair. Fog Bank (fire + ice: its next shot
  misses 60%, the ice melts), Greek Fire (fire + corrode: the fire leaps to every other ship),
  Powder Keg (a Volley into another captain's fire: 40% of the volley splashes every other
  ship), Brittle Hull (a Volley into another captain's ice: +50%), Crushing Deep (ice + Kraken
  coils: 20% of the hit per coil, half splintering onto another ship), Boiling Sea (fire +
  coils: the burn grows 25% a coil and lasts a turn longer), Rot (corrode + feeble: the barrier
  is gone), Numbed (weaken + ice: a turn more frozen), Last Rites (a Mega into another captain's
  Mark: +30% past any barrier), and the secret DAVY'S KISS (fire, ice and corrode from three
  different captains: 35% of the hit to every ship, once a fight). At most one reaction per
  ship per round, the element spent; damage scales off the hit, never the hull; splash never
  sinks. One captain holding both elements sets off nothing, and a solo dive records nothing.
  DISCOVERY: hidden in the Codex ("Reactions, N of 10 found", "?" cards) until a crew sets one
  off; then it is written for every captain in that fight (gauntlet_reactions_seen) and their
  screen says "Reaction discovered". Each has its own moment on the water. Checked by
  tests/reaction_check.gd.
  THE LOOK OF A FIGHT (Kong, 2026-10-04: "everything should look and feel good"; then, on painted
  effect sprites and Kie object art on the ships: "way too much ... a lot of things can just be
  particle effects ... I don't like the art style"): every effect is PARTICLES (game/fx_sheet.gd
  draws glows, embers, sparks, puffs, slivers, droplets, rings in code; no sprite sheet, no art).
  READABLE AT A GLANCE (Kong: "visually it should easily be able to identify what it is"): each
  status has ONE colour, shared by its chip on the unit frame and everything it draws
  (FxSheet.STATUS), and a SHAPE that says what it is. A ship WEARS (game/hull_aura.gd): Marked a red
  crosshair over the masthead (our Spotter's Mark four gold stars), Weakened violet chevrons
  sinking, Feeble cracks flashing and splinters, Corroded acid bubbles, Slowed a cold ripple
  spreading on the water, Silenced a crossed-out mark over the guns, Enraged chevrons and embers
  rising, Mending plus signs rising, Fortified a dome of hex glints, Blinded an ink swirl in the
  sails, Narrowed a ring closing on them, Kraken coils a spiral of droplets (a turn per coil), Fog
  Bank low mist, Boarded two lines of amber motes; a pack combo's halves are linked by running motes. Every battle event
  has motion (BattleFx: a status lands as its own shape gathering onto the hull; heals carry plus
  signs; flare-ups, freeze snaps, a ball tossed for powder given or stolen, a fizzle, a finishing
  blow; each reaction its own elements: steam, green fire leaping, a keg's blast, ice slivers,
  boiling bubbles, rot, a gold beam, whirlpools). BATTLE_SHOW=allev in
  tests/shot.gd plays every one; BATTLE_SHOW=wear stages the statuses.
  THE COMBAT LOG (game/combat_log.gd; Kong: "an action log ... more robust since it's a desktop
  only game"; docked on the RIGHT EDGE, the recap ON DEMAND): every event the stage plays is
  written from the one place it plays them (BattleStage._one), so nothing goes unlogged (the
  web's LogBox kept one turn; the port's caption kept one line). Grouped by fight (a dive's
  depth) and turn, scrollable through the whole raid or dive, sticking to the newest line unless
  scrolled up. Names in their own colours (you gold, crewmates theirs, enemies red), lines about
  you in the second person, damage bold, crits lit, statuses in their chip's colour; hovering a
  status, reaction or combo explains it. Filters All / Me / Crew / Enemies / Damage; L hides or
  shows it (Prefs combat_log_open). The stage's spoken captions are logged too, except where the
  log already wrote that event. RECAP (a button): per captain, per fight or the whole run: damage,
  taken, healed, given (bond heals and shields on crewmates), crits, best hit, assists (bonds and
  reactions). Only what happened, never an enemy's next move. RECAP=1 in tests/shot.gd opens it.
  The log has no box (a soft fade into the edge, as tall as its lines): a mark in the actor's
  colour per line, the number in its own column, thin turn rules, older lines settling back, one
  chip cycling the filter. THE AIM BAR (game/aim_bar.gd, fx/aim_bar.gdshader; Kong: like the
  fishing dial, "more game-like ... fits our aesthetic"): the dial's instrument laid flat (dark
  wood, a brass line, a cream paper track with ink ticks, the bands as watercolour washes, the
  one under the needle lit full), a tapered ink needle on a brass cap in the colour of the band
  it is over, FIRE or VOLLEY in Cinzel with its key; it floats free (the deck's paper fades while
  aiming). CREW SUMMONS (game/summon_cast.gd + BattleFx; Kong: "I want using crew summons to feel
  very satisfying"; the web's AbilitySummonFx and chase strikes, never ported until now): a
  sigil turns on the water under the caster and a helix climbs out of it; the screen sinks into
  the dark in the crew's colour (the equipped skin's, else the class's), motes gather, a flash,
  and the crew blooms out of it (the skin's portrait, its foot faded into the light) with rays,
  two rune rings and a burst of sparks; the name lands in Cinzel, its letters drawing together,
  the order over it; it holds, breathing, then comes apart into motes. A CHASE SKIN gets a wider
  bloom, a second flash in its colour, more of everything, and its ChaseFx signature over the
  portrait. Then each order its own strike: Mender heal raining down (the Galaxy's stars spiral
  in), Tidecaller a tide swept across and a shell, Sharpshot a reticle, Snare rings of light
  pulling tight, Anchor a splash and a shell, Navigator balls tossed in, Leviathan the crew's own
  creature breaching beside the enemy and slamming into it (the Krakenhunter's sea erupts first),
  Apex a volley per hit (the Tempest's lightning instead), Oracle glyph rings, Vengeance an
  aureole of rays, Requiem a reticle closing (the Huntersbane's blood red). Click or Space hurries
  it. BATTLE_SHOW=crewsummon (SUM_CLS, SUM_SKIN) in tests/shot.gd stages one. Oracle's Foresight
  revealing the enemy's next moves is the ONE allowed exception to the no-prediction rule (Kong).
  THE DECK (Kong, 2026-10-04: "the words are enough ... the action log can also reside at the
  bottom ... a pop-out option"): one wide deck; on the left the orders as words with their keys,
  as the web's ActionMenu: FIRE (F; with a Volley or the Mega in reach it opens Fire F, Volley V,
  the Mega M, Esc back), RELOAD (R), DODGE (D), SPECIAL (S: the repair kit), the drum (B), Flee
  (X, raids only), the rack's balls inline; the crew's orders in a slim row under them; on the
  right the log's last lines with Recap and Full log (L pops the whole log out on the right
  edge). The deck stays up while a round plays (the orders dim). THE REPAIR KITS (web
  lib/repairKits.ts, never ported until now; port rules battle.repairKits): a Special that heals
  the kit's baseMin..baseMax + floor(Fortune x 0.25), times repairHealMult (Field Repairs), costs
  the turn, ONCE A FIGHT (the web's "once per battle"). THE LADDER (core/repair_kits.gd, the
  web's buyRepairKit): the Gunwharf's Repair kit tab; bought in tier order, each behind its
  Navigation level (6, 12, 20, 30) and price (4k, 12k, 30k, 65k), worn at once; an owned kit can
  be carried again; each row's heal shown with this crew's Fortune. tests/repair_kit_check.gd.
  ON THE WATER: the maelstroms (game/maelstrom.gd, a port of seaMaelstrom.ts): the painted
  whirlpool turned on a projective keystone, the throat's terraces dropping below the plane and
  leaning to the camera, the lip and its spray (GPU particles under gravity), foam, spirits, the
  keeper rising; the wreckage is RigidBody2D physics in a flat space laid onto the bowl (Kong:
  "utilize godot physics"); the hull is carried round by the whirl (CampaignWater.whirl).
  MOVED (Kong): Don's maelstrom now turns in the Last Fathom (the Throne's bay), port rules
  campaignWater.maelstroms. THE ENTRY (game/gauntlet_entry.gd; Kong: "all of it will be in that
  screen ... we have to account for party building and readiness"): ONE screen, the raids'
  ready check on the left (Solo / Co-op / the held dive, the line's cards with their solo and
  co-op deepest, who is ready, Dive / Leave) and on the right, in place, tabs with the
  captain's Fathoms beside them: THE DESCENT (the host, the chest ladder, the chase), the
  LOCKER, the CODEX (game/gauntlet_codex.gd: discovered N of M, fogged until taken; inside a
  dive, from the breather, also "this dive": online, ready, one away) and the RECORDS
  (game/gauntlet_records.gd). The fight is on the live sea like a raid's, the water recoloured to the
  descent (Kong: "just the sea just like raid fights but custom to match the aesthetic of each
  gauntlet"): Davy's teal-grey, the Don's kraken green, hardcore's blood, darker with depth and
  for a boss. Between fights the dive's sheet (game/gauntlet_overlay.gd); each depth is called
  over the water with the host's voice. FIXED for raids too: the fight camera framed the enemy
  while it was still sailing in, so every fight sat to the left; it frames the marks now.
  THE ENTRY SCREEN (game/ready_screen.gd; Kong: "like going into a group dungeon in Warcraft"):
  the raid, the three tiers side by side (a shut one says why), four seats (each captain's avatar,
  ship, Navigation, hull, seated hands, pennants, Ready / Not ready; open seats), the boss and
  the crate's odds for this captain on this tier, and the foot (who is still to ready, the tier's
  terms, Ready/Leave or Sail/Disband). Solo it opens before every raid but the skirmish. In a
  Charter the table runs it (game/raid_table.gd): no clock, Ready per captain, the caller picks
  the tier (a new pick asks everyone again) and sails when all are ready; each captain's card is
  made on the founder's game. Crewmates not in the line see a banner with Join (lit only near).
  ON THE WATER (game/battle_stage.gd): every enemy its own hull, aura and plate; click a hull or
  press Tab to aim (a gold ring on the target, TARGET on its frame), click a frame for its stat
  card. FRAMES MODE (a field, or more than two ships in the line): unit frames down the left (the
  line, each order beside its frame) and right (the enemies), a slim name and bar over each hull.
- THE CAMPAIGN'S WATER, BUILT (2026-10-03). RULES: core/campaign.gd ports computeRaidMap,
  chapterForNode, buildClearedSetVia and all of lib/core/raidMap (the view, chapter unlocks seen,
  tolls, story reads with the legendary gates, puzzles, the caches, the muster, events, dice,
  the scout's debt, class picks, the spoils), with commitNodeClear's one-shot guard. PARITY:
  campaign.json, 248 calls in 3 sessions (the view as the chain clears, Captain's water, Nav and
  the giants; the whole chain walked twice, every stop by its action, with the refusals). The
  DPS gate's shot is PORT-NATIVE: it reads the battle seat's hit range and the class
  multiplier (the web reads raidLoadout, not ported; no item multipliers yet). Rules export:
  campaign {nodes, chapters, backdrops}, campaignWater (raidWaters.ts: bays with centres and
  shut lines, the 49 isles with plates, the 11 hulls with docks and art, beats, caches, fog
  banks, spans, portals), shipClasses, raidItems.
  PORT DECISION: CAPTAIN'S WATER IS OPEN. Buying the game on Steam makes you a Captain (the
  starter save is premium), so Chapter IV and the coda are everyone's; computeRaidMap's lock is
  kept for parity and never fires in play.
  THE WATER (game/campaign_water.gd): the Sea Gate opens once a raid captain is seated ("She
  sails with nobody aboard" otherwise); the anchorage's wall now holds from both sides, open only
  in the gate's mouth; the campaign's water ends at RAID_EDGE (North.hold). Each bay tints the
  sea in its own palette (Chart.sea_at, full inside 0.7 r, gone 1,600 past the rim). A SHUT bay
  (its chapter before not done) draws nothing; a hull inside its disc goes back to the rim, the
  inward way removed so she slides along it, with its line ("A Bigger Fish is shut. Finish The
  Loose Thread first."). A stop shows once it is not locked (or previews); an island carrying a
  stop is drawn and solid only while it shows; scenery islands always. Posts and chests stand on
  the islands (a pulsing halo on an unread one); enemy hulls ride at anchor as HullRigs with
  their portrait floating over the masts and a dock ring on the water, gold once you are in it.
  The next stop wears a bobbing gold "?", a cleared one a green tick; a stop coming into view
  rises out of the water with two gold rings (NodeReveal). Sailing into a bay names its chapter
  across the sky. The helm reads the web's verbs ("Take on X", "Settle with", "Crack", "Make the
  call at"...). GODOT OVER THE WEB: THE HULL AT ANCHOR IS THE FIGHT. Take on a raid and the
  battle opens where you are, from the dock: the skirmish's raider swaps in place, weighing
  anchor; a raid's boss WAITS AT ANCHOR while their crew come at you first, then becomes the
  enemy for the last fight. A lost fight or a gate that held puts her back at the Gunwharf.
  THE SCENES (game/story_scene.gd): the backdrop fills the screen with a slow drift and
  cross-fades when a line changes it; the cast on two marks standing into the dialogue plate
  (first speaker left, next right, a third evicts the least recent), the speaker stepping
  forward and lit, a closeup leaning in, a ghost pale; inserts drawn (the sealed letter with its
  wax initials, the F ledger, Finn as he is); shake and flash; `*word*` in the scene's accent;
  narrator slanted; 22 ms a character. Skip on replays only.
  THE SHEETS (game/node_sheet.gd, night paper, sized to what is on them): a story or a berth
  with a scene plays and the read is the clear; any other stop with a scene plays it once a
  session as the intro, then the toll, the cache's two items (press to arm, again to take), the
  call, the bones (a d20 tumbling onto the rules' roll), the gate (odds, fire one shot or pay),
  the clerk's ledger, the class cards, the yard's terms, the spoils. A RAID opens its BOSS CARD
  (the run, what the crate may hold, how often beaten and your best time, Set sail or the
  Challenge, open once the raid is beaten); the skirmish goes straight in. THE CHAPTER UNLOCK
  (the Long Cast's ChapterCard with the campaign's eyebrow and gold sparks), state-based: every
  main stop of the chapter before cleared and not yet seen; markChapterUnlockSeen on dismiss.
  WAYS HOME: a turning well beside each beaten raid's anchorage, "Take the way home" to the
  anchorage's mouth (the sea's own warp). THE COFFERS' SPANS drawn (the gate's eleven bars blow
  outward from the middle once the gate is run; the boom goes slack and sinks once the lens is
  cracked). THE SOUNDING's fog bank (seven lying puffs, four drifting, breathing). A lost fight
  or a gate that held warps her to the Gunwharf. THE FOG OF WAR past the gate (core/explore.gd
  xfog_*, a port of lib/seaExploreExp; its own grid of 700 cells boxed off the bays, its own
  column sea_explored_exp, OR'd in by saveSeaPosition's fourth argument; seeded on an empty
  mask with the junction and round every beaten fight). GODOT OVER THE WEB: drawn as rolling
  cloud (game/exp_fog.gd: one quad, each cell's cover in a small texture sampled smooth, two
  layers of drifting noise, a lit top and a darker underside, dimmed at night); it lifts by
  distance from the hull and never comes back. THE WORLD CHART (M) carries the campaign: each
  bay as a wash of its own colours with its name (a shut one hatched, with its line), its
  islands from their plates once shown and sailed, its fog as cloud, its stops as marks (hulls
  for the fights, a square for a post or a chest, the gold "?" on the next, a tick when done)
  with a card and Set course, and the share of the campaign's water sailed. A LEGENDARY'S DEBUT
  (game/legendary_unlock.gd): their card rises on slow gold rays and the name is pressed in.
  THE FIVE PUZZLE BOARDS (game/puzzles/beacon, cipher, mirror, cargo, tumbler on
  game/puzzle_board.gd's shared night-paper sheet; the rules as static functions, checked by
  tests/puzzle_check.gd on the real data): the beacon chain (lanterns; hovering shows the cross
  a press flips), the cipher dials (spring-turned pointers, sealed ones gold), the mirror run
  (the beam drawn travelling from the lantern, the prism splitting it, fires against the
  budget), the cargo shuffle (keys, a drag or a press beside the sailor; Undo), the tumbler
  lock (bars dragged one-to-one along their groove, the bolt sliding out). Busting a budget
  resets the stage as on the web. Added over the web: Reset on the beacon, cipher and mirror
  (the mirror's keeps fires spent), Undo in the cargo hold, a scramble never dealt already
  solved. NOT YET: the Wargate and the two maelstroms (the gauntlets are not ported).
- THE CHART ROOM, BUILT (2026-10-03). Rules: core/chart_room.gd ports lib/core/chartRoom,
  lib/chartBoards, lib/worldChart, the four pure engines (charting/treasureMatch and minefield,
  chart-room/hold/sudoku, chart-room/rigging) and chartLocal (each week's boards built from the
  dice the first time asked for and kept in save.charting; attempts kept twelve weeks).
  PARITY: chart.json, 371 calls over two weeks (Treasure Match runs replayed from their swaps
  with every refusal, the Minefield to a clear with strikes and flags, all four holds with
  notes, tallies and wrong manifests, a known Rigging board, the World Chart's thirteen claims).
  PORT RULES (chartRoomPort): a landmark pays a SKIN VOUCHER where the web paid gems: Bosun's
  for the first ten, Captain's for the last three, one more Captain's for charting the whole
  sea; one puzzle opens at each of Fishing 1, 10, 20, 30 (Treasure Match, the Minefield, Lay the
  Rigging, the Quartermaster's Hold; levelGates.feature chart_*). THE ROOM (game/chart_study.gd,
  "Study" ashore at the Mainland, day paper): a strip with the points, the next landmark and what
  it pays; tabs per puzzle (locked ones name their level) and the World Chart.
  game/chart_match.gd: the seeded board runs here on the rules' own engine (the swaps are sent,
  never the score); select or drag to swap, a swap that makes no line slides back, cleared gems
  pop with sparks and the points rise (x2, x3 on cascades, a rising tick a level), the rest fall
  with a bounce, a Compass glows; the tier ladder under the score; a card when the run ends.
  game/chart_mines.gd: a harbour of swelling water tiles, sounded tiles ripple open, pennant
  flags (right press or Flag mode), a strike blasts and resets. game/chart_rigging.gd: a plank
  deck, iron cleats on coloured rings, ropes dragged cell to cell (a twisted lay drawn along
  them), crossing cuts the other rope, going back takes yours up; a full board hands itself in.
  game/chart_hold.gd: the four holds as tabs, nine bays, givens in ink and yours in teal,
  pencil notes (and a placed lot clears its number from the notes it rules out), keyboard and
  pad, a Tally that marks wrong cells, a full hold handed in, a STOWED stamp. game/chart_world.gd:
  the painted map under a drifting fog (game/fx/chart_fog_holes.gdshader, noise from a
  NoiseTexture2D: procedural hash noise showed blocks), an uncovered landmark a gold beacon
  until claimed, a claim burning the fog back with a singed rim and lettering the name in, the
  list with each landmark's voucher. tests/shot.gd chartroom (CHART_TAB, CHART_PTS).
- CREW SKINS AND SKIN VOUCHERS, BUILT (Kong, 2026-10-03; reshaped the same day: "I want those
  vouchers to be item drops like how crates are", then "just two voucher types, and it should be
  hard to get any voucher"). All 75 of the web's skins (lib/crewSkins.ts) export to rules.json
  "crewSkins" with crewTier (the crew's FISH_GROUPS index): 24 for Rare crew, 27 Epic, 18
  Legendary, 6 chase. Gems are retired, so skins are EARNED through two vouchers, held as counts
  (port_rules skinVouchers.kinds):
  - BOSUN'S VOUCHER (red wax): rare 60, epic 30, legendary 10. Drops: wooden 1.5%, metal
    2%, gold 2.5% of crates opened; easy 3%, medium 4%, hard 6% of caskets.
  - CAPTAIN'S VOUCHER (gold wax): rare 25, epic 45, legendary 30. Drops: diamond 0.75%,
    ancient 1.25% of crates; elite 8% of caskets; and ONE at Parlor Legend (the Parlor's only
    reward; its other ranks are titles; profile.parlor_capstone_paid).
  Rates are a first guess, ASSUMING a regular player opens ~45 crates and ~8 caskets a month (150
  casts an hour, an hour a day): about one Bosun's a month in the middle waters, about five
  Captain's a year in the deepest. No real cast rates were measured; tune here.
  CHASE SKINS ARE IN THE LEGENDARY ROLL (Kong, 2026-10-03: "It's already rare to get a
  legendary. Just have it slightly harder to roll a chase skin if you roll a legendary"): within
  it each chase skin counts 0.75 to a plain legendary skin's 1 (skinVouchers.chaseWeight), so
  on a fresh collection 1 legendary roll in 5 is a chase skin: Bosun's 8% legendary and 2%
  chase, Captain's 24% and 6%.
  THE ROLL: the tier by the kind's weights over the tiers with a skin left (a tier owned in full
  drops out and the rest keep their shares, so a voucher never comes up empty), then a skin in
  that tier at random; never one owned; every skin owned pays 2,500 doubloons. It can land on a
  crew not signed yet: it waits in the Trunk. Worn at once if that crew is aboard and wears
  nothing; worn per crew type (every copy), as on the web. The first build's per-floor voucher
  list reads as kinds (rare/epic floors Bosun's, legendary/chase Captain's).
  core/skins.gd; ops skinsState, openSkinVoucher(kind), equipCrewSkin; Crew state's filename is
  the worn skin (baseFilename the plain card). Drops in Fishing.open_crate and the casket
  (Clues), told in the crate's notice and the casket's list. UI: the Crew Hall's THE TRUNK tab
  (the two vouchers painted, held, their odds in plain words, where found, Open; every skin by
  crew, the ones not found in grey pencil; a skin's page to wear or take off), a skin row on a
  roster hand. ART: items/voucher-bosun.png and voucher-captain.png (Kie.ai, magenta keyed).
  THE REVEAL (game/skin_reveal.gd): the sealed card shows the voucher's painting and trembles
  while its glow climbs the tiers to the one it is, a tick a tier; it flips to the skin on its
  tier's colour with a ring breaking out; legendary and chase add turning rays, and a chase
  skin plays its OWN SIGNATURE (game/chase_fx.gd, a port of the web's ChaseSkinFx: Tempest's
  lightning flash and sparks, Kraken Hunter's caustics and bubbles, Galaxy's nebula, stars and
  shooting stars, Fossil's glyph rings and motes, Hunter's Bane's reticle and lock, the Idol's
  aureole), ambient on tiles, roster cards and pages, bold on the reveal. A sweeping sheen was
  tried first and cut: shines on cards are a rejected look.
  tests/skins_check.gd.
- THE PARLOR, BUILT (2026-10-03). Port-native rules, no parity (the web's Parlor is weekly
  and generated; the port's settled shape is not): core/parlor.gd, with the web's tables
  (rules.json "parlor": payouts 50/100/200, the 12 s clock and 4 s grace, the ranks, the King's
  prizes and havens at 4 and 7, the capstan's wheel, strikes and 250 vowel). THE BANK:
  content/trivia_bank.json (1,580 questions, 140 phrases: about a year of daily play before a
  repeat), built by tools/build-trivia.mjs from the web's weeks (356), the
  fresh fact-checked set (content/trivia_fresh.json: the trivia-bank-800 workflow, 2026-10-03,
  eight topic writers of 100 and a separate fact-checker on each batch who kept, fixed or
  dropped every question; 773 kept, 768 after dedup against the web's; 118 capstan phrases)
  and ~450
  questions from our own fish (the Log fact veiled, the water, the rarity); every question has a
  stable id and a captain meets every one before any comes round again (profile.parlor.seen).
  THE BOARD: a card every 8 hours into a hand of 3/4/5 (port_rules parlorPort), the tier
  weighted 45/35/20; a card shows its topic and worth face down and draws its question when
  turned. THE KING at Fishing 25, one run a week, rungs tier 1,1,1,2,2,2,2,3,3,3. THE CAPSTAN:
  three phrases a week, unseen first, no Captain gate. RANKS ARE TITLES; Parlor Legend gives a
  Captain's Voucher (see CREW SKINS above). The room
  (game/parlor_room.gd): the hand fanned face down in topic colours; a turned card grows into
  the question with a draining ring, the answers inked right or wrong and a stamp; the King's
  ladder with the havens marked and your marker; the capstan a wooden wheel that spins down to
  its wedge with a tick a wedge, the tiles, the letters, a solve box. tests/parlor_check.gd.
  TREASURE HUNTS ASK TRIVIA (Kong, 2026-10-03: "if you do trivia it actually helps you know
  the answers"): a fifth step kind, "trivia" (port_rules clues.kinds): the note asks a bank
  question, one this captain has met in the Parlor (at or under the tier's difficulty) if any,
  else one about our own fish; "Answer the note" on the hunt list opens its four answers on a
  slip; right moves the hunt on, wrong and the ink runs until the next sea day
  (Clues.answer, op clueAnswer). tests/clues_check.gd covers it.
- TRIVIA IN THE PORT (Kong, 2026-10-03, SETTLED; not built yet): the port has no server to
  generate questions nightly, so it ships a QUESTION BANK, rotated by day: the questions the web
  has already generated PLUS a freshly written set. Some bank questions double as TREASURE
  HUNT steps (a new clue step type), so playing trivia teaches answers the hunts ask for.
  Order of the room ports: the Den first (slots, roulette, blackjack), then trivia, then the
  Chart Room.
- FISH SLOTS, A MONEY SINK (Kong, 2026-10-02: the community pot was built for an online MMO
  where every bet fed it; "an always-available pot based on probability, more of a money sink
  than something you make money from, but still fun"). PROPOSED, awaiting Kong's OK: the
  Catfish Jackpot becomes a FIXED 300x the bet on three catfish (catfish weight 9 to 8,
  about 1 spin in 1,950), no shared pot and no feed. Pays trimmed so the machine returns about
  88.6%: triples sardine 3 / marlin 10 / great white 25 / whale 50, pairs marlin 1.25 / great
  white 2.5 / whale 4 / catfish 2; the bonus round (three hooks, about 1 in 72, Jellyfish wild,
  wins x1.5) and the two-hook refund stay. Still a win about 1 spin in 3. Worked with
  scratch enumeration matching slots-rtp.mjs's rules. SETTLED by Kong 2026-10-02 (300x, not
  the rarer 500x); build it this way when the Den is ported, re-checked with slots-rtp.mjs.
- THE LANTERN IS A BEAM (Kong, 2026-10-02: "like a flashlight, pointing where you're going"):
  the boat's PointLight2D wears Glow.beam() (a cone, apex at the lamp) turned to her heading,
  so it lights the land and boats ahead; on the water the shader throws a matching cone
  (u_beam, u_beam_len, u_beam_k) instead of the old reflected column. Its reach grows with
  the lantern tier. Other boats' and the town's lamps keep their reflections.
- THE LOG OPENED IN 0.9 s (Kong: "a delay when you click Log"): the shelf loaded ~150
  full 1024 px fish paintings from disk, and closing let them go, so every open paid again.
  tools/setup.mjs now writes art/fish_thumbs (192 px); Skipper.fish_thumb / "fish_thumbs/"
  urls hold them once loaded, and the Sea starts loading them on worker threads when it
  opens (Skipper.warm_fish_thumbs). The Hold tiles and the catch note use them too. An open
  is now ~70-90 ms. Full paintings load only for one fish's page. The Locker no longer
  pushes the camera in on the Log tab (the book covers the screen; the push in and back out
  read as a strange zoom).
- ACHIEVEMENTS, BUILT (Kong, 2026-10-02; the 2026-09-30 decision): core/achievements.gd.
  Badges pay ONLY points (1 rookie to 5 grandmaster). The 81 badges the port's systems can
  earn are checked on STATE after every action (RulesApi.run sweeps; never under parity)
  and queued in save "badges_new" for the HUD's notes (many at once read as one note).
  CAPTAIN COLOURS COME ONLY FROM POINTS (Kong: "skin colours only come from achievements"):
  port_rules achievements.colors, 18 milestones from 5 to 236 points (the port's whole pool
  today; stretch them as more systems port). Removed from crates, levels
  (fishingColorsByLevel all empty) and every other road; the four starters stay free. The
  Locker's Levels tab has an Achievements view: points, the colour track, every badge in ink
  or grey pencil. The rules export now carries the badge list (rules.json "badges").
- TREASURE HUNTS (Kong, 2026-10-02: "bottles like RuneScape clue scrolls; the dig is the
  final step; never come across a dig spot except on a hunt"): core/clues.gd. 3 to 5
  bottles a sea day, hashed from the day, shared, each taken once per captain; the water
  sets the tier (Shallows easy, Open Waters medium, Deep hard, Abyss and Ancient Deep
  elite), one hunt per tier in hand. Steps (easy 2, medium 3, hard 4, elite 5): bearing
  (metres off the nearest landmark), riddle (port_rules clues.riddles, one per isle), catch
  (a species of the tier's water), word (ask a regular). Then a dig at one of the 12 sites in
  the tier's water: its tell shows only to a hunt pointing at it, the chart no longer marks
  sites, and digging without a hunt gives nothing (the old once-ever dig rewards are gone).
  The casket: doubloons, bait, and a crate for the stash (35% easy to always elite).
  The three dig badges now count hunts. tests/clues_check.gd plays every tier to its casket.
  NAMES (Kong: "too close to RuneScape's tiers"): the four are named for what the bottle
  holds, a Scrawl, a Ship's Letter, a Torn Map and a Last Will (ids stay easy..elite). A
  CATCH step never names the fish: it quotes what the Log says of it (the species' fun fact,
  the name taken out by Clues.veil), so a fish caught before can be looked up and one never
  caught must be guessed.
- THE FISHING GUIDE MOVED (Kong: "it does not belong in the Locker"): game/levels_sheet.gd,
  a paper sheet over the sea opened by pressing the level bar (FishingHud.open_guide); the
  Locker's Levels tab is gone.
- THE SEA WIDENED (Kong, 2026-10-02: "the Shallows start too close to the Mainland; an overall
  expansion is fine"): core/sea_scale.gd. Everything on the fishing side past 1,400 out moves
  port_rules seaExpand (1,000) further out along its bearing, so the Shallows now run 2,400 to
  4,800 and every water keeps its width. Applied once when the port's rules load: the waters'
  rings (Chart.WATERS is a static var, widened by Chart.widen), the isles, buried sites,
  buyers, regulars' moorings, currents and kelp, the traders' reach, the blooms and the sandy
  caustics; hotspots and bottles follow the rings. A chart saved on the old grid is carried
  over cell by cell (Explore.fog_decode). Never under parity (web tables alone).
- THE LONG CAST, FINN'S CAMPAIGN AS THE MAIN STORY (Kong, 2026-10-02). Settled: the story
  never gates anything; no story rewards beyond the jobs' own pay (flat XP, and the doubloons
  the web's jobs already pay); "the Salt Road" is renamed: the panel is the JOURNAL (Story /
  People tabs), the saga THE LONG CAST. Rules: core/finn.gd ports finnState, speakToFinn and
  turnInFinnQuest (+ finnQuests' ladder, chapters, standing), parity-checked by a 623-call
  session working all 32 jobs and the reveal ("finn" in shop.json). On the water:
  game/finn_hull.gd (moored where the web moors him, widened with the sea; LOOKS LIKE NOBODY
  ELSE (Kong, 2026-10-03), friendly not grand: his line always out with a float that bobs and
  dips, a small fish flipped up into his boat every 24 to 42 seconds with a splash ring (and a
  plip when you are near), a green parrot on his boat (one of the game's pets; Kong's idea; the
  lantern and pole were tried and cut as ugly), and slow calm rings going out from him every 3.2 seconds; a gold ? when he
  has a job your level reaches and none is open, a gold ! when one is done; gold means the
  story only), game/finn_scene.gd (his lines typed one at a time; the job as a paper slip,
  game/job_slip.gd, stamped TAKEN when taken and flown up to the story line, or sealed DONE in
  wax when handed back, its XP poured into the level bar, then his next beat and the next
  slip), game/story_line.gd (under the level bar: chapter, job, progress; each counting catch
  sends a gold mote into it with a pluck a semitone higher, so the last few climb; the last
  one presses a wax seal with its own chime and the line turns gold, "Back to Finn"), and
  game/finn_arrow.gd (a gold chevron at the screen edge pointing to him while he has a mark).
  His state is read off the local save each second (a crewmate's Charter never sends it).
  THE JOURNAL (game/journal.gd; the story line, or J): Story, SPOILER-FREE AND PICTURES
  OVER PARAGRAPHS (Kong, 2026-10-03: "spoiling future things; too wordy"): the chapter you
  are in as a banner, a road of five medallions (finished inked, yours lit red with its jobs
  as pips, the rest sealed: numeral and opening level only, never a title), the job's slip,
  the last thing Finn said, and the rest of what he has told you folded under one button.
  Future chapter titles appear nowhere (the story line says "Chapter II opens at Fishing 15") and People (what the regulars are waiting on, handable first, then a card
  each with their face, standing and a red dot when there is a reason to sail out; unmet ones
  are question marks with their water). CHAPTER CARDS (game/chapter_card.gd): parchment over
  everything when a chapter's first job is offered, and when its last is handed back
  ("Complete. 8 jobs for Finn, 755 XP."). PORT-ONLY JOBS (Kong, 2026-10-03; port_rules
  finn.portJobs, p1-p8, two in each of chapters I to IV, slotted after a named web job;
  Finn.quests() builds the ladder, 40 jobs, and the web's 32 alone under parity): the fish he
  describes (catch_species: the Log's fun fact with its name veiled, Clues.veil, on the slip
  and at the end of what he says; Walleye in the Shallows, Turbot in the Deep), the light or
  weather at the cast's spot (catch_condition: golden, storm, night, fog), a shoal
  (catch_hotspot) and a trophy (catch_trophy). The last three count off profile.finn_tally,
  bumped by Finn.on_catch after every reelIn from profile.finn_cast_at (the castLine spot),
  port only; every job measures from its snapshot like the web's. tests/finn_check.gd works
  all 40 and checks the wrong catches do not count. A CHAPTER CLOSES ON THE WATER (Kong,
  2026-10-03; game/finn_moment.gd, played round your boat when Finn's scene closes after a
  chapter's last job, each its own): I a ring of little fish leaps all round you; II flying
  fish skip across your bow; III a marlin clears your boat in one leap; IV lights rise out of
  the dark and break the surface (the music muffles under them); V six gold rings open round
  you one by one with a rising tick each, and a megalodon's shadow passes beneath. Flat
  things drawn on the water (foreshortened by the World's squash), leaping things un-squashed;
  every splash also rings the sea's field. tests/shot.gd finnmoment (FINN_CH).
- NORTH OF THE REEF, PLACES FIRST (Kong, 2026-10-02): game/north.gd, a port of chart.ts's
  reef, anchorage and Sea Gate and SeaMap's reefRocks/anchorageRocks (same seeds, so the same
  rock). THE PORT'S OWN ROCK (Kong, 2026-10-02: the web's pale side-on crags did not fit the
  islands): web/public/sea/north-reef-1..10, north-wall-1..5 and north-arch, generated through
  Kie.ai from nano-banana-2/prompts/north-*.json (blue-grey island-rim stone, painted from the
  camera's three-quarter angle, the wall darker basalt), keyed on magenta HARD 35 / SOFT 8.
  The same seeds place them, so the layout is the web's; the picture at each spot is not. The
  arch is ONE picture over the passage (ARCH_WIDE 1,600, opening 0.26 to 0.83 of it), anchored
  at its near foot so a hull past that foot draws behind the span. NO SIGN on it (Kong: a
  board with "The Anchorage" on it "shouldn't be there"). THE CROSSING (Kong: "really cool and satisfying"), by
  position so turning back runs it backward (Sea._passage): the view eases out 10% through the
  passage; the music (its own "Music" bus, a low-pass) muffles under the span and opens beyond
  (Sound.muffle); the water's colour turns from the fishing sea's to ANCHORAGE_SEA across the
  passage (Chart.sea_at); the span thins to 45% while the hull is behind it on screen; a gull
  flock always wheels over the arch. At the change: spray off both beams (Boat._spray), a
  ship's horn going north (Sound.horn) and the bell coming south, and the side's name lettered
  in from wide spacing with an ink rule run out under it. Every rock stands in the water as the boats do (fx/waterline with a calm
  lap_amp 0.4, plus a collar; the arch has no collar and a sloped waterline, its far foot
  higher). The reef runs the chart's width at NORTH_WALL with one gap, the arch (GATE_X -900,
  half 430); the anchorage is the disc of 3,600 from (0, -3000), walled wherever north of the
  reef, with the Sea Gate due north (half 620). North.hold keeps a hull to the arch and inside
  the wall; the Sea Gate holds you too (the campaign is not ported) with a line saying so.
  Past the sign in the arch (GATE_SIGN_Y) the boat becomes your ship, and back again south of
  it. Drawn as the web's Warship (Kong: "match what's current in the web"): the hull's SEA
  art (lib/ships.ts seaImageUrl, ship-hero/*_v3.png; never the old models/*_v2), in a
  340-wide box with its keel (seaKeel) on the water, turned by seaFlip into the chart's
  bow-left convention, with a soft reflection; an equipped ship skin's hull (lib/shipSkins.ts
  imageByTier) instead, drawn 0.969/0.651 wider for its padded plate. The rules export now
  carries "ships" and "shipSkins". IN THE WATER like the fishing boats (Kong): Boat.set_ship sinks the hull
  below its waterline (Skipper.SINK of the box above the keel) through fx/waterline, rings it
  with Skipper.collar_of, and reflects it as the boats do (a twin about the waterline in a
  CanvasGroup through fx/hull_mirror, lying down by Skipper.LIE and swaying). The waterline and its
  ring follow the keel's own slope (Kong: "angled with the bottom of the boat"; the
  Brigantine's stern sits higher than its bow): Skipper.keel_tilt fits a line to the lowest
  painted pixel of each hull column (bowsprit and ends left out) and the waterline and
  water_collar shaders take it as `tilt`. Measured: sloop 0.03, schooner 0.04, brigantine
  and galleon 0.12, man-o-war -0.04. THE FISHING BOATS TOO (Kong: "even fishing boats are at a
  slight angle"; about -0.03 on every sheet and overlay): Skipper._water_fx turns the hull's
  slope into each part's own picture, so the cut is one line across the hull, the captain and
  any overlay, and the collar tilts with it. NPC boats share it (they are Skippers).
- WHEN A FISH BITES BEST (Kong, 2026-10-02): core/fish_bias.gd, port_rules fishBias. Night,
  Golden hour (dawn, dusk, a low sun), Storm (a Rain Squall, Gale or Tempest over the line)
  and Fog each name a few species per water, picked for what the real fish do; Fair Wind is
  NOT a condition (Kong). While one holds where the line goes in, those species are nudged
  +25% (+40% in a Tempest) AMONG THEIR OWN RARITY only (FishingRules.tier_weighted_pick
  weights the pool; with nothing holding it is the web's uniform pick, so parity is the
  same): the odds of a rarer fish, pay, XP and crates do not move. tests/bias_check.gd holds
  that. Shown: a line under the water's name ("Night: ... are feeding."), "Bites best ..." on
  the Log's page and its shelf (caught or not), and the forecast names what a coming storm
  or fog will stir in your water.
- THE CREW HALL, SLICE 1 (2026-10-02): core/crew.gd ports lib/core/crew.ts getCrewState,
  recruitCrew, upgradeCrewHall, dismissCrew and renameCrew over the save's crew and recruits
  (crewLocal), with crewRules/crewGen's rolls on the rules' dice. The rules export carries
  "crew" (names, stat budgets, trait weights, board odds, the level curve, groups, classes,
  the hall ladder, capacity, the legendary gate, and traitLabel over the whole -4..4 cube).
  PARITY: tests/parity/crew.json, a scripted session of 97 calls (boards over 17 days,
  signing to a full roster, every hall tier and gate, names, dismissals and their refusals),
  each result cut to the port's crew state (board, roster, capacity, navLevel, hallTier,
  doubloons). PORT RULES (crewPort): a fresh free board every sea day at sunrise (Kong), and
  the hall reads FISHING where the web reads Navigation (capacity, tier gates) until
  Navigation is earned in the port. game/crew_hall.gd is the hall on paper, opened by mooring
  at the Crew Hall: Recruit (the board, a card opens the hand, Sign on with its moment),
  Roster (one-time names, dismiss on a second press) and The Hall (tier, painting, roster
  space, the next tier). Card art is content (card-arts, 320 px card_thumbs). NEXT SLICES:
  crew levels' stat ticks, seats (bunks, Drills/Stores and promotions are slice 2, below). SUNRISE NOTICE
  (Kong): each sea day's fresh board is announced in the HUD's note slip ("New hopefuls at
  the Crew Hall"), and on coming back to a board not yet looked at (Sea._crew_morning; a
  captain who has never had crew is not told until they have).
- THE CREW HALL, SLICE 2: BUNKS (2026-10-03). Rules: core/bunks.gd ports lib/crewBunks,
  lib/crewBunkSettle, lib/crewRules' stints and the Leviathan offer, lib/crewTraits' 28-entry
  deep table and lib/core/crew.ts bunkCrew, collectBunk, resolveTraitOffer, buyHallUpgrade and
  checkPromotions over the save's bunks; Crew state carries bunkedCrewIds, bunkLockedCrewIds,
  bunkTerms, drillLevel, storesLevel and capHours, and dismissal is refused while a hand is in
  a bunk (training, or finished and not collected). The rules export carries crew.bunks (rate
  by Drills tier, hours by Stores tier, both ladders' prices, the Leviathan slot, the deep
  table, the milestone levels). PARITY: crew.json "the hall bunks", 86 calls: every refusal,
  both ladders to VI behind the hall, early collects, the Leviathan's offers taken and
  declined, a fully trained hand turned from an ordinary bunk and welcome in the deep, and
  promotions across a long run of stints. THE ROOM (Kong, 2026-10-03: "make the bunk and
  training experience look and feel better", custom art and animations): the Crew Hall's
  BUNKS tab (at the hall; "N ready" on it when a stint is done or a draw waits),
  game/hall_bunks.gd. Six painted bunks, one style per hall tier (web/public/crew/bunk-1..5,
  driftwood bunk beds up to a carved canopy bed, and bunk-leviathan, a bed of leviathan ribs
  with a teal glow; Kie.ai, magenta keyed), shut ones in grey pencil with the tier that opens
  them. game/bunk_tile.gd: a hand lies IN the bunk (the bunk's front drawn again over them),
  breathing, z's drifting up, and a CANDLE beside it burning down as the stint runs (the candle
  is the timer); a done stint glows gold and the hand bounces to get out, with a bell. Pressing
  an empty bunk opens the picker (free hands first, the rest greyed with why; the Leviathan
  bunk adds the stint length, 1h up to Stores, since a shorter stint is more draws). Bunking
  drops the hand in with a bounce. game/wake_moment.gd: collecting lifts the hand out to the
  middle, counts the XP in and ticks the level up a note at a time, a ring and motes on landing
  (teal from the Leviathan bunk). game/promotion_card.gd: each promotion after it, a card
  dropped in tilted, the class's colour ringing out, a wax seal pressed with the new tier and
  the old Special struck through over the new one. Draws from the deep wait at the top of the
  room: the trait carried beside the trait offered, Take the new one / Keep theirs. Drills and
  Stores are painted per tier for the port (Kong, 2026-10-03: the web's line art did not match
  the painted bunks): web/public/crew/hall-drill-1..6 and hall-stores-1..6, Kie.ai, driftwood up
  to leviathan bone like the hall; the web keeps its own drill_N and stores_N. Six pips, what
  the next tier buys, its price or the hall tier it needs. tests/shot.gd crewbunks (BUNK_SHOW wake,
  promo, pick).
- NOTICES (Kong, 2026-10-02): the free board each sunrise IS the Tavern Notice (port rules
  crewPort.freeWeights 76 / 22.3 / 1.7 / 0: an Epic on 5% of boards, never a Legendary). Two
  items post a fresh board in its place at their own odds (crewPort.notices, per face, three
  faces): a HARBOR BILL (Epic on 15% of boards, a Legendary on 1 in 100) and a CAPTAIN'S
  PROCLAMATION (Epic on 20%, a Legendary on about 1 in 34); Legendaries come only from them.
  Held in the profile's crew_notices; Crew.post_notice spends one and stamps the day so the
  free board does not come down over it. Drops (crewPort.noticeDrops): Ship's Letter and Torn
  Map caskets 25% a Bill; Last Will caskets always a Bill and 10% a Proclamation; gold and
  diamond crates 3% a Bill; ancient crates 5% a Bill and 1% a Proclamation. The legendary
  campaign gate still applies (only Catfish and Doby Mick until the campaign is ported).
  tests/notice_check.gd holds the rates over 20,000 boards each.
- TWO PAPERS (Kong, 2026-10-02: "everything in the anchorage and the expeditions should have a
  darker paper theme, to separate the two"). Fishing's menus keep the day's tea-stained sheet.
  The expedition side (the Crew Hall and everything north of the reef from here on) is the
  NIGHT PAPER: a tarred chart, warm-black (Paper.NIGHT_PAPER), cream ink, brass for what is
  chosen, dark buttons. A screen sets Paper.night while it builds and unsets it after; the
  sheet, buttons, rules and stats read it, and its own text uses Paper.ink() / ink_soft() /
  ink_faint() / red(). Rarity and class colours are lightened on it rather than darkened.
- THE EXPEDITION SIDE OF THE HUD (Kong, 2026-10-02): the level bar stays on Fishing until
  you pass under the arch's sign (North.ship_water, the same line as the change of boat),
  not merely north of the Mainland. There the bottom row becomes the expedition's: CREW (the
  roster), RECRUITS (the board; a dot when a fresh one is in) and SHIP (game/ship_sheet.gd);
  Crew and Recruits open the Crew Hall from anywhere, without its building room
  (CrewHall.at_hall), which is only shown moored at the hall. More join as voyages and raids
  are ported. THE CROSSING (Kong: "very satisfying and seamless"): a pool of light under her
  (gold north, sea-blue south), the boat she leaves fading down while the other rises out of
  the water with an overshoot (Boat._rise), the water ringing out three times, the row she
  leaves sinking away and the other rising a button at a time, the level bar crossfading,
  and the side's name lettered over the water ("The Anchorage" / "The Fishing Grounds").
  Opening the sea already on a side is no crossing (Sea._sided). The northern islands (Crew Hall,
  Posting House, Forge, Gunwharf, Charterhouse) were already drawn; mooring now opens a paper
  sheet of what each will hold (North.COMING) until their rooms are ported. THE WORLD
  CHART centres on the crossing (WorldMap.WORLD_CENTRE, Kong: "the centre of the world is the
  fishing/expedition crossover"): zoomed all the way out it settles there, the reef inked
  across the middle with its arch, the anchorage and its wall above, the campaign's water
  hatched as uncharted, and only the fishing sea under fog.
- THE PORT'S OWN RULES FILE (2026-10-01): content/port_rules.json is laid over the web's
  tables by Rules.data() (dictionaries merge, "_" keys are notes). The parity runner sets
  Rules.web_only so it replays against the web's tables alone. Put a deliberate rules
  change there, with its reason, rather than editing rules.json (the export overwrites
  that). FIRST USE, THE CRATE REBALANCE (Kong, settled the same day after one revision):
  a crate stays 1% a cast in EVERY water (zones.crateChanceByZone, all 0.01; so crates an
  hour fall with depth as waits lengthen, and that is intended). Depth decides WHICH tiers
  can come up, and no water gives them all: shallows wooden 90 / metal 10; open waters
  wooden 60 / metal 32 / gold 8; deep metal 55 / gold 35 / diamond 10; abyss gold 55 /
  diamond 45; ancient deep ancient. Each tier strictly better (doubloons 100-300 / 300-900 /
  800-2000 / 2000-5000 / 4000-10000; wooden bait 10 not 5). COSMETICS STAY RARE in every
  crate (1 / 2 / 3 / 4 / 5%); a better crate reaches RARER ones, not more: each item in the
  web's pool has a band (crate.cosmeticRarity: common black and gray bandanas; uncommon
  spotted, cheetah, Mint; rare fuego, Lavender, Offwhite boat; epic golden bandana, Storm,
  Charcoal boat) and each tier draws only from its bands, weighted (crate.cosmeticBands:
  wooden common; metal common+uncommon; gold up to rare; diamond uncommon to epic; ancient
  rare and epic). CrateLoot.roll uses the bands when they are present. Pet chances
  unchanged. The first proposal (chance climbing with depth) and a currents bonus were
  both declined.
  THE CRATES TAB IS A COLLECTION (Kong): all five crates in a row (a count on the ones
  stowed); the chosen one's drop table: where it comes up, what is always inside with its
  odds (doubloons, bait, a cosmetic, a pet), every cosmetic its bands can give and every
  pet any crate can give, owned in colour with a tick, the rest in grey pencil
  (fx/greyed.gdshader; Paper.Tile.grey), "Collected n of m" with a bar, and a red
  "Complete" when it is all yours. Pet pictures are cut to their painted area.
  EACH CRATE ITS OWN PETS (Kong chose this one part of a proposed revamp; no-duplicates, a
  pity meter and completion rewards were offered and not taken): crate.petTiers in
  port_rules.json puts every pet in exactly one tier (wooden: red parrot, brown monkey,
  beige raccoon; metal: blue parrot, brown seal, green lizard, orange crab; gold: green and
  charcoal parrots, black raccoon, gray seal, indigo lizard, blue crab; diamond: sand
  parrot, white lizard, gold seal, gold crab; ancient: gold parrot, golden monkey).
  CrateLoot.roll_pet_from draws from the tier's list weighted by each pet's share of the
  web's whole roll; petChance per tier is the web's; duplicates still happen. A crate's
  completion counts only its own pets and cosmetics.
  DIAMOND AND ANCIENT PETS MADE RARER (Kong: too common once each crate had its own pets):
  petChance diamond 1.5% and ancient 4% (the web's 4 / 10). Each diamond pet about 1 in
  267 diamond crates, each ancient pet about 1 in 50 ancient chests (was 1 in ~100 and 20).
  Cosmetic odds unchanged.
  The ANCIENT DEEP drops diamond crates too (Kong): diamond 50 / ancient 50.
  PET CHANCE settled at 1% to 4% by tier (Kong): wooden 1, metal 1.5, gold 2, diamond 3,
  ancient 4 (supersedes the 1.5 / 4 above). A RuneScape-casket redesign (several rolls a
  crate, tier-exclusive unique tables) was planned and declined: keep it as it is.
  DIAMOND AND ANCIENT MADE RARER (Kong: "too common"): fewer items in those crates meant
  each came out more often than in a gold one. Cosmetic 2% in both (was 4 / 5), bands
  diamond uncommon 2 / rare 2 / epic 1 and ancient rare 2 / epic 1 (an epic half as likely
  as anything else in its crate), pet 1.5% / 4% (was 4 / 10). Per item now: diamond
  cosmetics 1 in 375, epics 1 in 750, pets 1 in ~267; ancient rares 1 in 225, epics 1 in
  450, pets 1 in ~50.
- THE STYLE KIT (Kong, 2026-09-30: "the web game isn't gospel; standardize or improve"). The
  first ported screens were flat boxes; the web's look is layered CSS. `game/kit.gd` is now the
  game's design system and every screen is moving onto it. `game/pane.gdshader` paints a panel
  the way CSS does (rounded rect, gradients at any angle up to 4 stops, a radial wash, sheen,
  inner glow, border, accent top edge, soft shadow); `game/pane.gd` is the container that
  carries it, `Pane.PaneButton` a button on one. Every Cinzel and Karla weight the web uses is
  copied in, with letter-spacing done by FontVariation. `tests/kit_gallery.gd` shows every piece.
  THE STANDARDS, chosen where the web did one role several ways (from a survey of 20 screens):
  - ONE ink ramp, warm: `#f4ecd8` / `#d8d2c6` / `#9a9488` / `#6a6764` / `#4a4845` (the web had
    three: violet, cool blue, warm grey). Each ROOM keeps an accent: the Almanac violet, the
    shops gold, the sea warm sand; it tints eyebrows, selections and borders.
  - Rarity: the catch card's palette (`#94a3b8 #4ade80 #60a5fa #c084fc #f59e0b`); the
    market's near-copy is retired.
  - Type roles: display, title, heading, name, number (Cinzel); eyebrow (Karla 700, 0.16em; was
    ten trackings from 0.09 to 0.28em), eyebrow_hero (0.24em, ceremonies only), label, body,
    small, note, value, button, chip.
  - ONE modal shell (radius 18, opaque `#0a1016`, accent hairline, deep shadow; was five
    recipes), one card for the one-lit-thing moments (radius 16), one scrim (0.7, or 0.9 for a
    moment that blocks; was six alphas).
  - Buttons: primary (solid gold, the one thing to do), accent (a wash of the room's colour),
    secondary, danger; two sizes, two radii (12 and 9; was six).
  - ONE close button (a 30px circle with a drawn X; was five sizes) and ONE back pill (the
    bronze leather one).
  - Chips: radius 999 everywhere, one recipe (ShopStatusPill's); status pills
    active/owned/next/locked.
  - Progress bars: 7 tall (3 for the mini), faint track, the colour brightening along it,
    0.7s ease.
  - Stat rows: one size (the web had three for the same role).
  - Motion: three moves (a modal rising in, art popping in, a stagger), plus a press squeeze.
  KEPT from the web as the good parts: the Almanac's paper and washes, its chapter rules that
  double as progress, frameless specimens on a halo and floor shadow, silhouettes; the catch
  card's one lit surface; tileSurface (state on the top rim, a sheen); the back pill; the
  Mainland doors; the market's lantern and ledger ground.
  DONE: the kit, every sheet (Sheet), the room shell and its helpers (Room), the Almanac, the
  catch card, the crate, the golden choice, the level-up (soft rays), the fishing HUD, the
  Market, the Tackle Shop, the picker ashore, the buyer, the loadout, the bait sheet, the
  title screen and the harbor.
  THE HUD TAKES THE WEB'S LAYOUT (it was better than the port's): a round, glass-faced cast
  button (`game/dial_button.gd`, the web's DialButton: teal to cast, gold to reel in) over
  four equal menus, the hour as a pill under the water's name. Where there is no fishing the
  button steps aside and the reach pill takes its place.
  Rules learned: a pane draws through its shader, so anything a pane draws itself (the catch
  card's shockwave) goes on its own layer; clip_children only on a pane with no shadow.
  The Ancient Deep's ceremonies and the Completionist reveal ride the kit's type through the
  shared text helpers (Kit.face) and keep their own staging. Every screen is on the kit.
- THE CHARTER SLICE, BUILT (2026-09-30): two ships on one sea, as a Charter.
  - THE TITLE SCREEN (`game/title.gd`): your captains (portrait, level, purse, last played;
    Play, Retire asked once, a new captain named with the Steam name offered) and the
    Charters (host one you founded; found one, normal or hardcore, fixed at founding; join a
    friend's). Retiring moves the file to `retired/`, as the desktop shell did. `Main` moves
    between the title, the harbor and the sea.
  - THE CHARTER'S FILE (`game/charter.gd`): `charters/<id>.json` on the founder's machine,
    with up to four berths, each holding that member's Charter captain as a whole save. Set
    Sail locks the roster (`refusal()` turns newcomers away).
  - THE CREW'S LINE (`game/crew_net.gd`): the founder's game runs every action. A crewmate's
    `Session.act(op, args)` goes to the founder by its TS name, runs through `RulesApi` on
    their captain there, is written into the Charter file, and comes back with the save,
    which the crewmate's copy adopts in place. Every screen now calls the rules through
    `session.act` (solo, it runs at once). Transport: a Steam friends-only lobby with
    GodotSteam's peer when Steam is up (invite through the overlay, Join Game,
    `+connect_lobby` on launch); otherwise the local network on port 24650. The Steam path
    is written to GodotSteam 4.22.1's API and NOT YET TESTED: it needs an App ID (or 480) and
    two Steam accounts.
  - THE HARBOR LOBBY (`game/harbour_lobby.gd`): four berths filling as friends join, Invite
    friends on Steam or this machine's address on the network, Set Sail (two captains at
    least) for the founder, "Waiting for the founder" for the crew.
  - ON THE SEA: each ship sends where it is ten times a second. Crewmates' ships
    (`game/shipmate.gd`) are drawn in their look with a teal name plate, glide between
    updates, and show as a named mark on the screen's edge when off it. Arrivals and
    departures are toasted. The HUD has a Captains (or Leave the Charter) button.
  - `node tools/play.mjs --pair` opens two windows as two players. `tests/smoke_charter.gd`
    runs two headless copies (host and crew): join, Set Sail, each sees the other named, the
    crewmate fishes for real on the founder's clock and buys bait, a refusal comes back as a
    refusal, the Charter file holds it all, and leaving is seen.
  SCOPE DECISIONS (Kong, 2026-10-04, after the completeness audit): NO CAPTAIN TIER ("You get
  the whole game. It's a full game that you buy": Rules.premium_active is true outside the
  parity run; the Captain-only rod lock is gone). NO TUTORIALS PORTED (no tours, coach lines,
  first-voyage or skirmish tutor); later, basic HELP MENUS, "a lot more on discovery like
  Terraria". NO MAIL (it was for the online game; the port writes none, the two web letters and
  the first-Ancient contest kept behind Rules.web_only for parity). A MUCH MORE ROBUST SETTINGS
  PAGE is to be built.
  SMALL ONES FROM THE REST (2026-10-04):
  - THE PRIMEVAL EYE'S SLOT: the Eye seats itself in the Sunken Hand's slot when it drops (the
    web's grant); Loadout.equip_second_special (equipSecondSpecial) seats or clears it, only with
    the fishing spoil; the Locker's Special slot shows it beside the first ("Seated" / "Hand's
    slot"), a press toggling it.
  - THE TIDE TURNER: 3 skips a SEA DAY (Fishing.tide_day; the date under the parity run).
  - RENOWN (core/renown.gd; the guide's Renown tab, from the level bar): both boards, Fishing
    and Navigation, on the web's curve (50,000 past 100, +15,000 a level, steady at 200,000);
    spend a point a press; a respec token clears one board and costs 200,000 ⟡ (the web's 2,000
    gems x 100). The effects were already read (Rules.fishing_renown, the battle seat).
  - THE COMPLETIONIST'S EFFECT FORGE (the Tackle Shop's Completionist card, once owned): every
    owned rod with an effect of its own as a toggle, up to three, "Forge these in" (free the
    first time, the reforge price after; Loadout.set_completionist_effects, already ported).
  - THE HOMESTEAD (core/homestead.gd, game/homestead_room.gd; tables content/homestead.json via
    tools/export_homestead.mts): mooring at the island opens it. The house a rung at a time (the
    web's prices, 60,000 to 2,400,000 ⟡), each rung repainting the island on the chart
    (Sea.refresh_home) and opening a furniture slot and a room; the main room's five slots
    furnished (bought once and kept, put back free, the five found pieces only off their isles);
    the island named (2 to 24 letters, numbers, spaces, apostrophes, hyphens, ampersands); up to
    six earned badges on the gallery's rail; the menagerie shows every pet, the trophy room the
    giants landed, the gallery the Almanac's count. Each room painted with what is in it at the
    web's spots. The crew's one base in a Charter (the save's "homestead"). Its 8 badges are
    earnable (221 of 243 now).
  - THE TAVERN (game/tavern_room.gd, core/tavern.gd, content/tavern.json; the Mainland's
    first door, open now): the social room, saying how things stand. OVERHEARD: three snatches
    of the room's talk from the web's 81 (lib/tavernGossip.ts), shuffled per captain, turning
    over on the hour, each line always said by the same two patrons (Avatar faces hashed off
    the line); eight lines reworded to be true in the port (the anvil's two-for-one, the
    Gauntlet without a daily limit, hardcore crews, boards that post anew when finished, the
    slots' catfish line, the Parlor's king, fresh hands at the Crew Hall). YOUR CREW: the
    Charter's captains with their faces, aboard or ashore (alone: what a Charter is and where it
    is founded). THE SALT ROAD: the three regulars who know you best and their standing, read
    only. The web's daily tot and races are cut with their systems.
  - THE CAPTAIN'S LOG (game/captains_log.gd, core/journey.gd, content/journey.json from
    tools/export_journey.py; Kong 2026-10-05: "leave out ai log"). Opened by pressing your name
    at the top left. CAPTAIN: the profile (face, levels, prestige stars, achievement points,
    badges, hull and ship name; the record in fourteen numbers; the six rarest catches; the
    showcase crew, else the six best). STORY: the campaign half of the web's story recap, every
    stop cleared in map order by kind (story, battle, milestone, port of call) with its bridge
    line, and the next open stop. Finn's half is NOT repeated: the Journal already keeps every
    word he has said. JOURNEY: the web's 14 goal groups, cut to the badges the port lists, one
    group at a time, nearest goal first, with a bar wherever the save keeps the web's count
    (port-reworded badges show no bar, their targets differ); a met bar reads met. No badge
    claims (the port's badges pay only points). A crewmate's face in the Tavern opens their
    Captain page alone, read from their berth without opening a session. The AI voyage log is
    cut.
  - THE GAUNTLET'S MOMENTS ON THE WATER (game/gauntlet_moments.gd; Kong 2026-10-05, "Ok
    proceed" on the proposal: each moment its OWN move, never one reused). Every between-fights
    step now happens in the world before its sheet comes up (the sheet steps aside while one
    plays, BattleStage._stage, once per phase per depth). DESCENT: the water spirals under the
    party and opens out in the band's colour as the depth card comes up. SHRINE: the chained
    idol (gauntlet-shrine.webp) breaches beside the party; then your answer: Davy's Coin spins
    up off the altar onto your deck (won) or into the sea (lost), the Blood Price reddens the
    water in rings round the stone, Walk On lets it settle. FENCE: the peddler's boat
    (gauntlet-merchant.webp) rows in lantern lit, ties up, and rows off when the stall closes.
    CURSE: dark ink spreads under the hulls from one point, bubbles over it. THE DON'S JOB: a
    launch of his (the sloop hull, green washed, a green lantern) comes alongside and waits
    until the job is settled. BREATHER: the chop settles and soft light comes down round the
    party (short; it comes often). HOMEWARD (cash out): the spiral turns back, light comes
    down, the party lifts toward it. DROWNED: the hulls settle under one by one and the rings
    close over them. ARRIVALS (the lead of a fight): an elite out of a fog bank with two
    lanterns in it; Pete swings in from the far water and turns hard into line; Krust comes up
    stern first shedding water; the Cartographer inks in over chart lines spread on the sea;
    Spet sails through his own toll gate (two buoys, a chain dropped); the Admiral's line of
    ghost ships fans out behind him and fades; the Quartermaster comes in along a column of
    gold laid on the water; Sal Brackwater slides in before a boom of floats; Don Finleone
    rises level and slow out of a still green sea, the ripples running backward. The
    Consigliere and the rest sail in as before. Effects are particles and drawn shapes; only
    the idol, the peddler and the hulls are paintings. Gauntlets only; the campaign's raids
    keep their own entries. Fixed on the way: the Walk On card read "5%%".
  - EACH BAND ITS OWN SEA (game/deep_look.gd, game/deep_atmos.gd; Kong 2026-10-05: "visually it
    needs to look and feel a lot more intense and different"). Before, the dive's water only
    darkened a little to depth 25 and then held, the sea's own weather ran on, and the bands
    were names. Now every band of both gauntlets has its own sea: the water's colours (easing
    toward the next band's as you go), the light, a rolling murk, a vignette that closes in
    round the fight deeper down (the Crush and the Maw breathe it), and the dive's OWN weather
    (the sea's is set aside while you dive: rain, lightning only in the storm bands, no fronts).
    One thing in the water per band, all drawn in code. Davy: pale wisps in the Shallows of the
    Dead; wreck planks drifting on the Drowned Shelf; a court of floating candles in the rain at
    Davy's Court; the Starless Reach black with glowing specks and lightning; violet silt falling
    in the Silt Fields; the Leviathan's shadow passing under you on its Road, in a storm, the
    surface ringing over it; ash in the Black Meridian; the Crush red with embers rising and
    lightning; the Bottom of the World near black, a few embers, the dark tight round you. The
    Don: green wisps in the Shallows; kelp on the Weedbound Shelf; the Kraken's arm sweeping
    under the hulls in his Court; ink blooming (green at the edges) in the Ink Reach; fronds
    falling from the Drowned Canopy; the Leviathan's coil under you; black kelp; spores rising
    in the Crushing Deep and the Maw. A boss leans the dark in; the Don's rise takes it all the
    way. The hulls stay readable at any depth: the light never falls all the way to the band's
    colour and the murk thins between you and the enemy. Leaving a dive eases it all back out.
  - THE FIGHT DECK, CREW STANDING UP (game/battle_look.gd CrewCard; Kong 2026-10-05: the orders
    and actions were "too blended into the bar"; boxed cards were "really ugly", and "no need
    for class colors"). The crew's orders stand above the deck's top edge, frameless: each
    crewmate's art on a soft halo of warm light with a shadow at their feet, name and order in
    plain words under them with their key. Ready: the light breathes; hover: they rise a little;
    ordered: they stand up out of the line, the light full and a pool under them, the order in
    gold; spent: grey, the light out. Keys 1 to 6 give or take back an order (new in the port).
    The actions are taller with drawn icons (ball, reload, swerve, kit), in cream; only Fire,
    the main action, carries gold and a little light. No class colours on any of it.
  - FINN'S FINALE (One Last Ride; Kong 2026-10-05: the dial "a hybrid of the fishing dial and
    expedition aim styling"). game/aim_dial.gd (AimDial extends AimBar: the same needle, zone,
    judgment and afflictions) for aimStyle "dial", centred over the water: the fishing dial's
    shape (a round face, rim ticks, the bands on a ring, a needle from the hub) in the aim
    bar's flat dress (dark lacquer, a hairline edge, solid amber/green/gold bands, the needle
    in its band's colour with brackets, a lock that rings and throws embers, FIRE and its key).
    The needle and band turn at a mark at twelve o'clock (judgment linear). Fishing gear feeds
    it (lib/dialAim): hook tiers and the rod's catch zone widen the hit band, the reel slows the
    needle (relief 0.32); hit/graze x0.34, crit x0.9. AimBar now carries hit_w/graze_w (the bar's
    own unchanged). HIS PERFECT STREAK (critStreak): Battle.begin hands it to every seat
    ("raidStreak"), tide_agg reads it (+7% a crit to 14), and at 5 a shot goes through his
    plate; the dial shows it. HIS DEFEAT (defeatSequence): a hit-stop on the blow, the water
    darkening as he goes UP rather than under, his last words (the closing line the sea's), the
    dark lifting from him outward, then "Finn Defeated" and the crate. NO WARGATE (Kong,
    2026-10-05).
  - THE DAMAGE GATE (Campaign.dps_preview) counts the raid items that touch one straight opening
    shot at a ship that is no boss: non-crit, escort and first-shot multipliers from the battle
    seat, tempered grades in (the web counted the non-crit cost alone).
  BADGES AND STEAM ACHIEVEMENTS (2026-10-04, the audit's ninth item): 213 of the 243 badges are
  now listed and earnable (81 before). Achievements.EXPEDITION checks the expedition side and the
  rooms off state (crew, voyages, trawls, Finn's jobs, raids and challenges, the ship, the Sunken
  Hand's spoils, the forge, both gauntlets, the Chart Room, the Parlor, crew skins, bounties, the
  campaign fog), each the web's badgeConditions condition read off the port's records;
  EXP_MOMENTS are granted where they happen (the Den's, the Chart Room's and the Parlor's, plus
  new trackers). NEW TRACKING: highest_raid_damage (Bounties.note_raid_hits); the raid feats
  (core/raid_feats.gd, fed the battle's events in battle_stage and raid_table: iron_ruse,
  tight_quarters, dead_reckoning, not_a_shot_fired, all_hands_legends); the Don's banked-run feats
  in gauntlet_table _record (ultimate_only, weight_of_green, untouched). PORT WORDING: bounty_hoard
  is 500,000 doubloons from bounties (the web's 5,000 gems x 100); clean_sweep is a full Captain's
  Board hand answered without a miss (the port deals a hand, there is no weekly board). Locker
  master compares against the Davy Locker's own upgrades (the web's check reads all 54 and looks
  unearnable). CUT with their systems (22): the Captain tier, the Hardcore Gauntlet and Davy's
  Terms, Blood Gems, the Exchange. NOT YET (8): the Homestead's house. FIXED: a crate's special
  item (the Primeval Eye off the Sunken Hand) now sets its owned flag, as the web's ITEM_GRANTS
  does; it was landing as inert raid gear. STEAM: every listed badge is a Steam achievement of
  the same API name; SteamLayer.achieve sets this machine's captain's as they are earned and all
  held ones when the sea opens. godot/steam/achievements.csv (tools/steam_achievements.gd) and
  godot/steam/achievements/ (64px icons and greyed locked ones, tools/steam_achievement_icons.mjs,
  from the badge art) are what to enter in Steamworks.
  THE FORGE, REDESIGNED (2026-10-04; Kong: "a lot of room to improve the forge and recipes",
  then chose every proposal): core/forge.gd and the anvil at the forge island
  (game/forge_bench.gd). The 33 recipes are unchanged; how you use them is not.
  - DISCOVERY replaces the Fathom toll: two items on the anvil either take to each other (the
    recipe goes into the book for good, no forging needed) or do not (forge_tried, never tested
    twice). Fathoms buy RECIPE NOTES (60): one undiscovered pair that uses something you hold.
    The web's learned recipes count as found.
  - PREVIEWS: both parts' effects, the result's, what the forge takes (a last copy losing its
    grade or its mount, in red), the base drops behind a tier-3 result. The picker marks pairs
    that fuse and pairs already tried. The book shows every found recipe against what you hold.
  - TEMPERING: a spare copy and scrap (10, 25, 50) raise an item to +1, +2, +3, shared by every
    copy (profile raid_item_grades); each grade adds a tenth of the BONUS part (1.20 to 1.22; 30%
    to 33%); costs and on/off effects stay; a drum, whose power is its beat, cannot be tempered.
    The grades ride into battle (seat "grades", Battle.item_fx), never under the parity run.
  - SALVAGE: a copy into scrap (rare 5, epic 10, legendary 25), never the last mounted copy.
  - TRANSMUTING folds the Abyssal Accelerator in: an epic boss item, a second copy and 25 scrap
    make its legendary at once (no building, no day, no charge). The Locker's three forge
    upgrades are on sale again with words for this forge (Gauntlet.PORT_WORDS).
  - Effects are said in plain words (Forge.effect_line).
  BOUNTIES (2026-10-04, the audit's seventh item; bounties.md's decisions of 2026-09-30):
  core/bounties.gd ports the board, its meters, the claim, the swap, the milestone ladder and
  the rung announcement; the catalogue, rungs, milestones and ranks are content/bounties.json
  (tools/export_bounties.mts off the frozen web; "today" and "nine hours" reworded). THE BOARD
  RESETS ON COMPLETION: claim every order and a new board is dealt at once (one swap a board);
  progress is what happened since the board was dealt. DOUBLOONS, NOT GEMS (Kong, 2026-10-04:
  "port with just doubloons for now"): an order pays its tier's gems x 100 (easy 1,500, medium
  2,000, hard 4,000, elite 7,500 ⟡) plus its points; the milestone ladder pays doubloons too
  (5,000 up to 150,000 ⟡ and the Corsair Hull; two rungs lifted so it never dips). The longer
  cosmetic track decided for Steam is NOT built (part of the tabled end-rewards question). The
  moments nothing else records go to the save's "bounty_events": a raid's biggest hit (solo in
  battle_stage, each captain's in raid_table), and at a Davy Jones run's end its depth and
  biggest hit (gauntlet_table _record); "a finished run" counts banked and sunk runs. No
  hardcore Gauntlet in the port, so its order is never offered. THE POSTING HOUSE'S BOARD
  (game/bounty_board.gd, mooring at posting_house): the orders with their bars, pay, points,
  Claim and Swap; the points, the rank's medallion, the next rank and milestone with Collect; a
  rung newly earned announced once at the top.
  VOYAGES (2026-10-04, the audit's sixth item; voyages.md's decisions of 2026-09-30):
  core/voyages.gd ports planVoyage, the single event and loot roll, revealVoyageResults and
  voyagePayout; the tables and story pools are content/voyages.json (tools/export_voyages.py,
  run once off the frozen web; em-dashes in the stories turned to commas). RUNS ARE SEA DAYS:
  Coastal 2, Open 4, Deep 6, Triangle 8, Shroud 11, cut a little by Navigation level, the crew's
  Navigation and Swift Sails as before; the payouts stand as the web's (the runs are within a
  few minutes of its hours). GEMS ARE GONE; the expedition crate meant to stand in for them is
  NOT BUILT (its chance and table are still to set; Kong tabled the end rewards of the gem
  activities, 2026-10-04). Also as the web: one at sea, the voyage seats held while out, one
  flat crew-loss roll that Fortune takes to nothing at the route's Navigation level, Safe
  Passage removing it, the lost remembered (died_at, died_on_voyage_id) not deleted, crew XP
  to the survivors, lures, Massive Booty, the Primeval Eye charged, Navigator (and the Sky look)
  at Navigation 50, Fleet Admiral at 100 voyages. Route levels are enforced here (the web only
  locked them in the panel). THE CHARTERHOUSE'S BOARD (game/voyage_board.gd): the voyage seats,
  filled from the free hands right there, with the crew's Power, Navigation and Fortune; the
  five routes as tall cards (painting, pay, XP, sea days, how it tends to go, the risk in red
  with the Fortune that clears it); a press chooses, Set Sail sends; while out, how long; home,
  their tale and the haul; past voyages behind a button. Safe Passage and Swift Sails are on
  sale in the Locker again. NOTE: the web's voyages no longer drop the Tide Turner, Phantom Hook
  or Perfected Sigil (their drop flags are always false), so in both builds they have no source.
  SPECIALS AND HATS (2026-10-04, the audit's fifth item): the rules were ported already
  (Loadout.buy_special_item / equip_special_item / buy_hat); the shops were missing. The
  TACKLE SHOP gains HATS (every bandana: for sale with its price, a press buys and wears it;
  crate-only ones say so) and SPECIALS (the Auto Caster for 5,000 ⟡, its Auto Catcher upgrade
  for 30 Fathoms at gauntlet depth 5, the voyage specials shown with where they come from),
  both on the landing's tiles and Ready to Buy shelf. The LOCKER gains a SPECIAL slot (owned
  specials, the Auto Caster wearing the Catcher's name once upgraded; the Primeval Eye stays in
  the finale's slot). The specials' words and art are port_rules.json "specialInfo"
  (lib/specialItems.ts); setup.mjs now copies their four pictures. No gems: none of these was
  ever priced in them.
  THE DAY'S ORDERS AND TRAWLS (2026-10-04, the audit's fourth item):
  - ORDERS (core/orders.gd), the progression.md decision of 2026-09-30 built: three orders that
    RESET ON COMPLETION. Each is claimed for its doubloons (the web's tiers, 60 to 375); with all
    three claimed the board is swept for a FISHING CRATE (into the stash, rolled as a crate from
    the deepest water the captain can fish) in place of the 10 gems, and a new board is dealt
    at once. The picks are Daily's own hash, keyed "board-N" where the web keyed the date; each
    board is pinned to the Fishing level it was dealt at. The MASTER order (Fishing 75) runs on
    its own track ("master-N") so a sweep never takes an unfinished one away; it pays a crate on
    the web's weights, stashed. Kept on the profile as "orders"; the web's per-date rows stay for
    the parity run only. In the Locker's Orders tab; an Orders button on the fishing row ("N to
    claim" in gold, else "N of 3 done"); a catch that finishes one says so; mooring at the Tally
    House opens it. Still per captain in a Charter (the shared board is its own pass).
  - TRAWLS (core/trawls.gd, game/trawl_harbor.gd): getTrawlState, deployTrawl and collectTrawl
    ported as they were (pay is fishing XP and doubloons, no gems): five waters, the slot ladder
    (Fishing 25 / 45+Nav 20 / 70+Nav 45 / 90+Nav 50), one per water and per hand, a hand sent
    leaves their seat, voyages and bunk stints hold a hand, the Ancient Deep behind the
    Quartermaster, the haul's luck band and flavour line, the Borrowed Jaw charged. The Trawl
    Harbor (mooring at trawl_fleet) lists every water, sends a hand from a picker that shows
    each one's expected haul, and brings a finished trawl in. RUNS ARE SEA DAYS (Kong:
    "trawls will follow in game days instead"): Shallows 1, Open Waters, Deep and Abyss 2,
    Ancient Deep 4 (48 minutes each, the nearest whole days to the web's 68 to 180 minutes); the
    haul is scaled by the new run over the web's, so a trawl's earnings per hour are unchanged.
  - No gems anywhere in the port (Kong, 2026-10-04). Activities that paid gems on the web
    (voyages first, bounties, the World Chart) need new end rewards, e.g. skin or recruit-roll
    vouchers: TABLED, to settle as each is ported.
  THE SHIP'S PURCHASES (2026-10-04, the audit's third item: the Mega was unreachable without
  them): core/hulls.gd ports buyShip (the Sloop to the Man-o-War a rung at a time, each behind
  its Navigation rung, prices in port_rules.json "hulls" since the export carries only the sea
  art), renameShip and equipShipSkin; Campaign.refit_classes ports refitShipClasses (after the
  Throne, every Captain's Choice re-walked in play order, the first free, then 1,000,000 ⟡,
  ship_classes only). The Gunwharf gains HULL (her picture, name and numbers; every hull with
  its numbers, hers marked, the next for sale) as its first tab, LOOK (her paint), and THE
  REFIT under Refits (pick a chapter at a time, each option's effects written out). A skin
  shows on the Man-o-War only, now in North.ship_art itself, so every render site holds the
  rule. Leaving the Gunwharf repaints her on the water and the HUD's Ship chip.
  tests/hull_check.gd.
  SETTINGS AND THE ESC MENU (2026-10-04; Kong: "a much more robust settings page"):
  game/game_settings.gd keeps them (Prefs "set_*") and applies them at start and on change;
  game/settings_sheet.gd (night paper, from the title's corner or the Esc menu): SOUND (master,
  music, effects, the sea; quiet in the background), DISPLAY (windowed, borderless, fullscreen;
  window size; VSync; frame limit; the FPS counter), PLAY (this captain's bite timer, controller
  rumble, reduce flashes, the full combat log open), CONTROLS (every key and pad button, by
  place; rebinding later), ABOUT (the build stamp, open the saves and logs folders, credits with
  the Godot, GodotSteam, Steamworks and font notices). Sound runs on buses: SFX, and the game's
  Music and SeaAmb sending through UserMusic and UserAmb so the player's volume never fights the
  game's fades. THE ESC MENU (game/pause_menu.gd): Esc or B with nothing else to close, at sea:
  Resume, Settings, Captains (or Leave the Charter), Quit to Desktop (saved); nothing pauses (a
  Charter's crew sail on). Closing the window saves the captain at sea. The title screen shows the
  build and has Settings and Quit.
  AUDIT FIXES (2026-10-04): the Locker's permanent upgrades all work or are off sale
  (Gauntlet.NOT_SOLD): Seasoned Timbers (repair kits +25%), Deep-Sea Plating (+10% max hull in
  every fight), Kingpin's Cut (legendaries twice as often in raid crates, the entry's odds too)
  now apply; Safe Passage, Swift Sails, the Forge, the Abyssal Forge and the Accelerator are off
  sale until voyages and the forge are built; the Don's Tribute and the Crimson Tithe are off sale
  for good. Both Lockers are read together (Gauntlet.owns), which fixed the Relentless Catcher.
  No gems are paid anywhere (level rewards, digs, isle landings; the parity run keeps them). The
  Crew Hall reads Navigation (crewPort.navFromFishing off). Stale copy fixed (looks and boats
  "bought with gems", the shore's doors, the ship page).
; Kong: "I would want to leverage steam playtest"):
  - BUILD: `node tools/build.mjs` (from godot/game; `--channel game` for the store app). It
    fetches Godot's export templates once if missing (about 1 GB), runs tools/setup.mjs (the art
    is not committed, so the build always packs the current art), exports the "Windows" preset
    (export_presets.cfg; content/*.json included, tests/tools/port_art left out) into
    build/steam/content/ (SeasTheBooty.exe, .pck, GodotSteam's DLLs), and writes override.cfg
    beside the exe: the channel's Steam App ID (SteamLayer reads steam/app_id) and a build stamp.
  - IDS: godot/steam/ids.json, per channel (playtest, game): appId, depotId, and the branch an
    upload is set live on ("" to set it live by hand in Steamworks).
  - UPLOAD: the build writes SteamPipe's app_build and depot_build scripts to
    build/steam/scripts/ and prints the one line: `steamcmd +login <builder> +run_app_build
    <app_build vdf> +quit`. Kong runs it (steamcmd asks for the password and Steam Guard code
    itself; credentials never pass through anything here). steamcmd: Valve's zip, unpacked
    anywhere (e.g. C:\steamcmd).
  - IN STEAMWORKS (Kong): the app (Steam Direct), its store page to Coming Soon (the Request
    Access button lives there), the Playtest (its own App ID and depot: put them in ids.json),
    Installation > General: launch SeasTheBooty.exe on Windows; Community > Rich Presence: upload
    godot/steam/rich_presence.vdf as English; Steam Cloud: Auto-Cloud on the user folder's
    captains/ (%APPDATA%/Seas the Booty/captains on Windows); then grant access (sign-ups or keys).
  - WHAT FRIENDS SEE: rich presence (SteamLayer.presence): "At sea", "Sailing with <Charter>",
    "On a raid: <raid>", "<gauntlet>, depth N"; a Charter's lobby is set as the "connect" string,
    so Join Game from a friend's list works (main.gd reads +connect_lobby on launch).
  - The Steam path (lobby, invites, the peer) has still never run with two real accounts: the
    first playtest session is its first test.
  THE SHARED RULES, BUILT (2026-10-01), `game/charter.gd`:
  - The Charter keeps the shared parts and LENDS them into a captain's save before each
    action, TAKES them back after, and lends the result to every other captain. So the
    ported rules run untouched, and parity is unchanged. A Charter captain's actions go
    through `Charter.run`: `Session.act` on the founder's game, `CrewNet._req` for a
    crewmate. After any action, every crewmate aboard is sent their save (`_sync`) and the
    screens refresh (`Session.changed`).
  - SHARED: the purse (doubloons), with a crew ledger naming who earned or spent what (the
    HUD's Crew purse button opens it). Each captain who joins brings their starting purse
    aboard.
  - SHARED: the Almanac: the log, lifetime counts, bests (with the holder's name, "Crew
    best · Ben"), goldens (every crewmate's, with the catcher's name), prestige and golden
    boosts, the zone rewards (paid once, into the purse while there is no chest), the giants'
    wall and the Vigil.
  - SHARED: the sea's market.
  - PERSONAL: levels, gear, the hold, bait, gems and Fathoms, each captain's regulars, and
    the Almanac's "read" stamp.
  - PRESTIGE IS A CREW VOTE: any captain proposes. Everyone else aboard is asked ("A crew
    vote", Agree or Not now) and it goes ahead only if all agree. A "not now", a minute with
    no answer, or a voter leaving stops it ("The crew said not yet.").
  - `tests/smoke_charter.gd` checks the one purse, the ledger naming the crewmate, the
    crewmate's catch in the founder's log, an agreed vote reaching the rules and a refused
    one stopping, and the founder's spending reaching the crewmate's purse unprompted.
  NOT YET: the crew chest (waits on the inventory sitting), and the SHARED DAILY BOARD (the
  daily rules count each captain's own play against a snapshot, so sharing the board needs
  its own pass). Also
  not yet: the nearby fishing bonus (to design), hardcore lives (they need sinking, which
  needs raids), the founder handing the Charter over, releasing a berth, and a first-run
  setup beyond the name (the web's SetupModal).
- DOCKING AND THE MAINLAND, BUILT (2026-09-30). The rules came first (committed 2af98918):
  `core/market.gd` (the hourly market), `core/selling.gd` (a stack, the whole hold, the buyer
  in each water) and `core/harbour.gd` (bait, rods, reels, hooks, the hold's upgrade, the
  Completionist), with 198 parity calls. The screens, to a spec read off SeaMap, seaBerth,
  ashoreDoors, MarketClient, TackleShopClient and TraderPanel:
  - The Mainland at its real size (r 500; the Godot chart had 340, which is also what
    docs/systems/ocean-hub.md still says, and it is stale), its plate anchored 42% down, the
    painted town standing on it, the shore at r x 0.72 + 55.
  - The berth (`game/berth.gd`): the pool, the rim and the 14 approach lamps with the chase,
    lit as you enter; HOME is inside it, so a new session opens on the dock prompt.
  - "Go ashore at The Mainland" as a pill over the menus with its key. E or the pad's Y
    presses whatever is in reach; Space does too where there is no fishing.
  - The picker, "Where to?", with its six doors. The Market and the Tackle Shop work; the
    Tavern, the Parlor, the Den and the Chart Room say NOT BUILT YET.
  - THE MARKET'S SIMPLE VIEW IS A FISHMONGER'S COUNTER (Kong, 2026-10-03: "too crazy;
    selling should be ultra straightforward; show the image of the fish"): one paper sheet,
    the purse, a tile per fish aboard (its picture, ×count, what the stack fetches) that sells
    the stack when pressed (the tile pops, coins fly to the purse, it counts up), and "Sell
    everything" that asks again on the button itself for 3 seconds. The Advanced board below is
    unchanged.
  - The Market's Hold side (`game/market_room.gd`): Simple and Advanced (remembered on the
    machine), the mood, the Sea Index, the countdown, vs Normal and Recent, hold value and
    sparkline, Sell all asked twice, a Sell per stack, the trade sheet, movers, and the
    price list.
  - The Tackle Shop (`game/tackle_room.gd`): the landing with Ready to Buy and the category
    states; bait; the hook and reel ladders; lines; the rod wall with its filters, Buy
    (equips), Equip and Sell asked twice; the Completionist card, its view and its claim
    reveal.
  - The buyer moored in each water (`game/buyer.gd`, `game/buyer_panel.gd`), dressed in the
    look SeaMap hashes off the water's id (exported with the rules), drifting on a short
    beat. "Hail" (then "Speak to") within 260; the whole hold at their rate. While you are in
    a water, a "!" on the screen's edge points to its buyer.
  - The harbour bell and the chest fanfare are synthesised as the web makes them.
  - `tests/smoke_docking.gd` plays it all on a scratch captain.

  NOT YET:
  - The Exchange side of the Market and its pending sales.
  - The market tutorial's coach lines.
  - The membership modal. A Captain's rod says "Captain only" and stays shut.
  - The other ports on the chart (the Shipyard, where the hold upgrade is sold; the
    Homestead; the Tally House; the Trawl Harbor).
  - The wandering traders and the regulars.
- FISHING PASS 3, BUILT (2026-09-30): the captain drawn on the boat as the web draws them
  (character color, hat, boat, rod, reel, pets, hook, at the web's percentages per pose; the
  bow pet rides on the water here too); the rod's menus (Loadout with a try-on preview and
  the five slots, Bait, Hold, Log); the Almanac (Collection by water with payouts and
  prestige and nine views, species pages, Goldens, the Giants' Vigil wall and hold-to-release,
  Pets with odds, Stats); the Auto Caster and Auto Catcher; changing color and the rod in hand
  ported with parity; and the Ancient Deep's fight brought back from the deleted screen
  (game/boss_fight.gd: every mechanic, the Vigil's scaling, blackouts, the giants' palette and
  aura; a miss lets it go, only the last phase is sent) with its ceremony (the slain
  cinematic, Finn's words, the rank-up, the capstone). Two web bugs not carried over: the sea's
  card read "Ancient 0 of 6" (the count was never passed), and Second Wind on a fight's miss
  now retries the same phase (the old screen reset the fight into a strange half-state).
  FISHING IS COMPLETE in Godot apart from what lives elsewhere: hotspots and regulars (the
  chart), selling and the tackle shop (docking), trawls (crew).
- FISHING PASS 2, THE LOOP'S FEEL, BUILT (2026-09-30), to a spec read off the web
  (FishingHere, CatchResultCard, CrateOpening, GoldenChoice, FishingXPBar, DialFx,
  LevelUpCelebration, HoldFlight, fishingMusic, haptics): the cast timeline (sound and pose at
  0, the line in the water at 600ms, the wait pose at 650ms, the waiting dots and timer from
  1.5s, the Instant Bite pill); the dial's lit wedges, perfect and snag marks, snap, perfect
  burst and the streak's fire (rings from two perfects, embers growing with the run); the
  full-screen perfect; the splash at the bow; the XP rising off the boat; the fish flying to
  the hold; the catch card arriving in order with its tally (Sell, XP, Double / Haul /
  Jackpot, Perfect, Streak) and a punch by rarity; the crate moment (the strip, the burst,
  the rare reveal); the golden choice (cannot be dismissed, asked again on opening); the
  level-up with its rewards; the Tide Turner and wormhole buttons; Second Wind; the XP bar
  with the streak; the hold count; the web's sounds and day/dusk/night music; the web's
  haptics as controller rumble. As on the web: no Locked-In display, no callouts for jackpots
  (they are card cells), no price on the golden choice, no crate sound. NOT YET: the Auto
  Caster and Auto Catcher, skins, hats, boats and pets drawn on the boat, and the Ancient
  Deep's fights (pass 3 with the menus).
- FISHING PASS 1, THE REST OF THE RULES, BUILT (2026-09-30): every function in
  lib/core/fishing and lib/core/loadout is ported (`core/fishing.gd`, `core/loadout.gd`): the
  wormhole reroll, the Tide Turner (still 3 a real day, as the web; the sea-day rhythm is the
  economy build's), goldens held, sold and mounted, fishing level rewards, zone completion
  and prestige to the cap and past it, the Vigil release, the Auto Caster switches, special
  items, hats, boats (level and achievement-point gates), pets in both slots, and the
  Completionist forge. `tests/parity/fishing_rest.json`: 6 scripted sessions, 570 calls,
  every branch and refusal, all matching. Fishing pass 2 is the loop's feel on screen, pass
  3 the rod's menus, the Almanac and the Ancient Deep fights. The tackle shop's bait, rods
  and hold (lib/core/harbour) come with docking.
- STAGE 1, THE FIRST SCREEN, BUILT (2026-09-30): `node godot/game/tools/play.mjs` plays it.
  The chart (the five bands off the Mainland, sailed by click, keys or a stick), the water
  (the web's shader ported, plus a flow current and a lantern pool on the water at night),
  night on the solid world (CanvasModulate plus the boat's lantern and the town's glow),
  wake and bow-spray particles, and the fishing loop: cast, the bite, the dial (buildFishZones
  and the reel's needle speed; the needle freezes exactly where it is drawn), Second Wind,
  snag immunity, the catch card arriving in order with fish art (gilded by shader on a
  golden), crates, misses. Saves in `%APPDATA%/Seas the Booty/captains/` in the web's
  format (the TS opens them). NOT YET: the captain select and first-run setup, docking and
  the rooms, the regulars and traders, hotspots, the Ancient Deep's multi-phase fights, the
  wormhole reroll and golden choice, sound, the sheets (hold, gear, Almanac).

**Status: parked 2026-09-10, the same day it was written. THE GAME STAYS WEB-BASED.**
**2026-09-28: Kong asked to PREP a possible Steam migration with offline play, up to the whole
game offline. Still no switch decided. See "Offline-capable port: the preparation plan" at the
bottom; its first steps change nothing a player can see.**

Nothing here is decided and nothing is being built. This is a worked-through idea kept because
the analysis in it cost something to produce and is still true — the scaling arithmetic, the
monetisation constraint, the phase ordering — and because it will be the starting point if this
ever comes back. Read it as "here is what we found when we looked at it", not as a set of
choices anybody made.

**Why it is parked.** A great deal of work has gone into making this a mobile and online
experience: the PWA, the touch chart, the phone layouts, the iOS plan, and a live multiplayer
presence system that only just started working properly. A Steam port throws most of that
away, and does it in exchange for problems the game does not have yet — the message bill that
motivated the whole conversation only bites at ten thousand players, and there are eighty
accounts today.

**What the port WOULD have required, if it ever happens.** These read like decisions below
because they were reasoned as decisions on the day. They are not in force:

- Premium buy-once, because Steam requires in-game purchases to go through Steam and the two
  Stripe pipes cannot survive a Steam build.
- Steam only, with the web retiring, because a second SKU means two economies and an
  account-linking flow to maintain forever.
- Which means the game design changes BEFORE the shell does. That ordering is the single most
  useful thing on this page and it is what makes the whole idea expensive.

## Why that decision is the one that gates the rest

Steam requires purchases made inside a game to go through Steam's own payment. The two
real-money pipes today are the Captain membership and the gem packs, both Stripe, and neither
can survive in a Steam build. So the choice was never "which payment library" — it was which
of three games to ship, and the answer changes the DESIGN, not the checkout code:

- Every `isPremiumActive` gate stops gating. Sailing pacts need it on BOTH captains; homestead
  visits, the compass arrows and the crew disc all read it. Those become unconditional.
- The gem economy loses one of its two taps. Every gem SINK has to be re-checked against the
  earn rates alone, or the top of the game becomes unreachable rather than merely long.
- It also settles the philosophy question in the right direction. The house rule is evergreen,
  player-paced, never pay-to-win; a single price and no shop is the purest form of that, and
  premium sells better on Steam than free-to-play does.

## What Steam gives back

- **Steam Datagram Relay.** NAT traversal and relay fallback, free, over Valve's backbone.
  This is the answer to the scaling wall: the message bill that would reach five figures a
  month at ten thousand players becomes nothing, and there is no TURN server to run.
- **Verified identity.** A SteamID is authenticated by Steam, so the transport needs no JWT of
  its own and no re-implementation of the pact rules.
- **The social layer already exists.** Friends, invites, "Join Game" from the overlay. Pacts
  and mutual follows were built because the web had no friends list. Steam has one.
- **Achievements.** 249 badges with a registry, tiers and conditions already in one file.

## Where development happens, and when it moves

**Development stays on the web until the game is content complete.** Decided 2026-09-10 with
the port itself.

The reason is the iteration loop and it is worth more than it looks. A push is live in three
minutes and a tester on any device sees it; a Steam build is a binary, an upload, a download
and a restart. Fifteen fixes in an afternoon — which is a real day on this project — is not
possible on the second one, and you cannot hot-fix a broken session while two people are
sitting in it. A game still finding its shape should not trade that away, and the current
testers are friends who tolerate breakage where a Steam playtest audience forms durable
impressions of an unfinished thing.

**But three of the phases below are not wrapper work, they change the GAME, and those happen
now, on the web, where the loop is fast:**

1. **Phase 1, taking the money out.** The most important thing on this page. It changes the
   BALANCE, so it needs months of play, not a week before submission. Finishing the web game
   with a premium economy and stripping it at the end means having balanced a game you are not
   shipping, and shipping an economy nobody has tested.
2. **Phase 4, controller support.** A design constraint dressed as a port task. Some panels
   will need rethinking rather than adapting, and that is cheap to find out now and expensive
   after another forty are built on the same assumptions.
3. **Retiring pacts** (part of phase 6). Steam friends replace them. No hurry, but do not build
   anything new on top of them.

Everything else — the shell, Steam auth, achievements, the networking swap — is mechanical,
gains nothing from early testing, and slows the loop if done early. The networking especially:
it replaces something that only just started working, and there is no reason to touch it twice.

**The risk is drift.** "We will port when it is done" runs forever. Two guards: write down what
content complete actually means, and spend about a week on a SHELL SPIKE soon (done: Electron, step 8 stage 3) plus
Steamworks bindings, one window, auth working, nothing else. Not to adopt it; to prove the path
and surface the surprises while they are still free.

**What would change this:** if controller support turns out to force real UI redesigns rather
than adaptations, then the wrapper IS changing the game, and the shell should come early so the
design is aimed at the real target instead of guessing at it.

## Rhythm without a calendar

The target feel is Terraria and Stardew, and the single thing those two have in common is
worth stating plainly because it decides a dozen smaller questions:

**Neither of them has one mechanic keyed to the real-world calendar.** Stardew is FULL of
time — days, seasons, festivals, crops — and every bit of it is in-game time that only moves
while you play. Put the game down for two years and you have lost nothing. Terraria has day
and night, blood moons and invasions, and no daily reset anywhere. They have enormous rhythm
and zero calendar, and that is exactly why people trust them enough to sink hundreds of hours
into them.

This game currently keys almost everything to UTC: the daily challenges, the bounty board, the
free recruit, the hardcore gauntlet's three runs, the trader rotation. That
is a live-service shape. It is also in quiet tension with the house rule, which has always said
evergreen and player-paced and never FOMO — a daily that expires is a small FOMO mechanic, and
it is only there because free-to-play retention wanted it.

**So: move the rhythm out of the wall clock and into the session.** In value order:

1. **Boards restock by PLAYING, not by date.** Clear the daily challenges or the bounty board
   and a new one comes up. Same content, same loop, nothing missed, no reset. Mostly deleting
   date logic, and it is the highest-value change on this page after the money.
2. **The gauntlet's daily run becomes a resource you earn.** Roguelikes gate runs with supplies
   or a key, not with a calendar. The push-your-luck stake stays — a run still costs something
   — without the something being "come back tomorrow".
3. **The free recruit becomes a token you earn.** Same reasoning.
4. **Trawls and voyages are real-time timers**, which is a mobile mechanic. Stardew's crops grow
   over in-game days that pass in fourteen real minutes. Shorten them a lot, or tie them to
   play time.

**Correction (2026-09-25): the sea's day and night is NOT on the real clock.** It is a
48-minute cycle (`lib/seaClock.ts`), so every session already sees the whole arc. The only
wall-clock coupling left on the chart is trader rotation, hashed off `(cell, seaDay)` so that
everybody sees the same people on the same day; keep that on the calendar (shared, optional).

## The order to do it in

Each phase is safe to stop after. Nothing below starts until the phase above is done, because
each one changes the assumptions the next is written against.

### 1. Take the money out of the game

The biggest design change and the one everything else sits on. Not the last step, the first.

- `isPremiumActive` returns true for everybody. Do NOT delete the call sites yet — flipping the
  helper is one line and reversible, deleting forty gates is neither.
- Audit every gem sink against earn-only rates. This is a real balance pass, not a search and
  replace.
- Strip the Stripe and Shopify checkout surfaces and webhooks from the client and the API.
- **Nobody paid.** Every membership on the live table was GRANTED, not bought, so there is no
  refund, no goodwill debt and no Steam keys to hand out. Stripe and Shopify can be deleted
  outright rather than disabled behind a flag: there is no purchase history to preserve and no
  webhook that must keep answering. Confirm the table before deleting, then delete.

### 2. Identity

Steam auth to Supabase session: the client gets an auth ticket from Steamworks, the server
verifies it with Valve, and mints a Supabase JWT. Everything behind it is unchanged, because
every value mutation already runs service-role behind RLS and does not care how you signed in.

**The one thing here that is a real decision: what happens to the players who already exist.**
The web retires, so roughly eighty accounts with fish, crew, badges and homesteads either come
across or do not. A one-time claim — sign in once with the old email, bind that row to a
SteamID — is cheap to build and is the kind thing to do for people who tested this for a year.
The alternative is that everybody starts again, which is defensible for a Steam launch and
should then be said out loud rather than discovered.

Note that this is the ONLY place old accounts matter. Everything else about identity gets
simpler: no linking to maintain, because after the claim window there is one way in.

### 3. The shell

Tauri or Electron around the existing app. The Capacitor plan already settled the pattern for
iOS — a remote-URL shell — and the same reasoning applies, because this game's value mutations
are all server actions and it is online-only by construction.

**The review risk is that it reads as a website in a box.** Native window, no browser chrome,
real fullscreen, bundled assets wherever possible, and honest failure states when the network
drops. Say "online only" on the store page rather than letting a reviewer discover it.

With the web retiring there is no longer a reason for the shell to point at a public URL at
all. Worth revisiting once phases 1 and 2 are done: assets can ship in the binary and only the
server actions need the network, which is a better product and a much better first impression
than a loading spinner over a browser.

### 4. Input, and the Deck

The largest single chunk of work and the easiest to underestimate. Controller support across
every panel, the dial, the raid aim bar, the gauntlets and 249 badge rows. Steam Deck
verification is worth targeting on purpose rather than hoping for.

### 5. Steam features

Achievements mapped off `lib/badges.ts` (one for one, the API name is the badge id; BUILT 2026-09-29, see step 8 below), rich presence, invites. Cloud
saves are a no-op: the save is already the database.

### 6. Multiplayer onto Steam networking

Replace the transport inside `lib/seaPresence.ts` with `ISteamNetworkingSockets`. Pacts and
mutual follows give way to Steam friends and invites.

**Everything above the transport carries over untouched** — the sender-clock velocity, the
interpolation buffer, the render lag, the stop beat. That layer took the longest to get right
and it does not care what carries it. See ocean-hub.md.

### 7. Compliance and the store

- **AI-generated content must be declared, and this is a RECEPTION risk rather than a
  paperwork one.** An earlier draft of this page filed it under compliance, which
  under-weighted it badly. Valve has required disclosure since early 2024 and it appears
  PUBLICLY on the store page, so every prospective buyer sees it before clicking. Games have
  been review-bombed over exactly that line, and the hostility concentrates among the people
  who write reviews and post on forums — which is the audience that decides a launch.

  It weighs against porting at all, and for this game more than most: the art is a large part
  of the appeal and there is a great deal of it — 249 badges, 75 crew skins, the fish, the
  hulls, the islands, all generated. Replacing it wholesale is not realistic at that volume.

  If it ever does come up, the affordable version is the useful thing to know: **what gets
  judged is the store capsule, the trailer and the first screenshots**, not badge icons nobody
  sees before buying. Commissioning hero art for the storefront while the generated long tail
  stays is the only version of this that costs a sane amount. Disclosure would still be
  required and still be visible; the thing people react to first would be real work.

  None of this applies on the web, which has no disclosure requirement and no review system to
  bomb. It is one more reason the parking decision was the right one.
- **Audit the casino before rating.** Blackjack, roulette, slots and a chip purse. Chips are
  bought with doubloons, which are earned — but trace every path from a PURCHASED currency to
  a chip and make sure none exists. Under premium buy-once there is no purchased currency at
  all, which is the cleanest possible answer, and that is worth confirming rather than
  assuming.
- $100 Steam Direct, 30% revenue share.

## What does not change

Supabase stays the authority for everything with value. The Pixi renderer, the chart, the
fishing dial, raids, gauntlets, the economy and every system doc in this folder are unaffected
by the port. This is a distribution and shell change with one design change at the front of it.

## Still open

- The price.
- Whether the eighty existing accounts get a one-time claim onto a SteamID, or everybody starts
  again. See phase 2.

## What is NOT decided

Everything above. In particular, and stated flatly because the earlier draft of this document
said the opposite:

- **The web version is not retiring.** It is the game.
- **The iOS/Capacitor plan is not cancelled.** It is still the live plan for mobile.
- **Nothing about the monetisation is settled.** The Captain membership and the gem packs are
  live and stay live.

## The one finding here that is NOT about Steam

The gem audit stands on its own and is a live balance question either way. All 75 crew skins
cost 113,750 gems against roughly 13,500 gems of one-off income, so the collection is only
reachable today because gems are PURCHASABLE. That is worth looking at as a balance matter
whatever platform this ships on. See economy-membership.md.


## Revisited 2026-09-25, and parked again

Kong asked whether the game could go fully paid, and then whether it could make money staying
on the web as it is. No decision: **"park all of this for now, not ready for the transition
decision."** What was worked out, so it is not redone:

**The calendar inventory** (every UTC-keyed mechanic and where it lives):
- **Gates progression, missing a day loses something:** Daily Haul (50 ◆, Captains 150; 20
  bait; weekly crate), daily challenges (3/day, 10 ◆ sweep), bounties (15-150 ◆/day by
  chapter rung, board expires, 1 reroll/day), free recruits (3/day, unrecruited wiped),
  hardcore gauntlet (3 runs/day per descent), Don's Tribute (10 Fathoms/day), Tide Turner
  (3 skips/day), Parlor Captain's Board (1 card/day, forfeits), Chart Room weekly points.
- **Shared or optional, fine on a calendar:** trader rotation (`seaDay`), Chart Room and Parlor
  weekly boards, casino buy-in cap (abuse guard), folk chats (1/day, story only), contests,
  mail expiry. NOT calendar: normal gauntlet (no limit), voyages (one pending at a time),
  trawls (timers), raids, the Exchange, sea day/night.
- Calendar-gated gem budget at endgame: about 210 ◆/day free, 310 Captain.

**The proposed restock-through-play numbers** (not approved, first draft for when it comes
back): a new challenge board 20 catches after the last is swept; bounties and recruits refill
after 2 voyages or raid wins, nothing expires, 1 reroll per board; Daily Haul becomes a meter
filled by any play (every 4th full meter = the weekly crate); Blood Keys (hold 3, one per
normal gauntlet run to a set depth) replace hardcore runs/day; Tribute paid per finished
normal run; Tide Turner holds 3, one back per 15 catches. Optional later: a seeded Daily
Gauntlet with a leaderboard (Slay the Spire's daily climb), missing it costs nothing. Open
questions left with Kong: the numbers, whether Daily Haul stays a daily gift, whether a missed
puzzle week carries over.

**Business models discussed.**
- Fully paid is possible: no gem store, Captain gates opened to all, gem costs rebalanced to
  play-only income. Best fit found was "free to start, pay once" (a free opening, one purchase
  for the rest), the same game on web and Steam, optional cosmetic-only extras later (the
  Deep Rock Galactic / Sea of Thieves shape).
- Going client-side like Stardew/Terraria (saves on the player's machine, player-hosted co-op,
  no per-player server cost) would be close to a rewrite: nearly every rule is server code. A
  lean server (account + cloud save, leaderboards, shared sea) is the realistic middle.
- Staying on the web as is is legitimate. Captain is ALREADY $9.99 one-time lifetime, not a
  subscription; but nobody has paid (all granted), so the price is untested. If staying:
  test real Captain purchases with the beta, tilt Captain toward cosmetics/convenience/supporter
  (away from daily gems and the casino cap), point gems at looks, do the restock changes
  anyway, and put the effort into acquisition (landing page, clips, the first ten minutes).


## Offline-capable port: the preparation plan (2026-09-28)

Kong: "prep a potential migration to Steam where there is offline capability, or for the whole
game to exist offline." This section sizes that and orders the work so that every early step
is useful on the web too, whether or not the port ever happens.

### Where the game stands (measured 2026-09-28)

**The rules are mostly portable already.**
- 159 `lib/` files (about 43,400 of 45,400 lines) import nothing server-side.
- That covers fishing levels, crew levels and generation, the raid map, the gauntlet, boss
  raids, voyages, badges, rods, roulette and blackjack, renown, raid loot, and fish size and
  shiny rolls.
- Many of these files say in their headers that they were moved out of `'use server'` on
  purpose.

**The glue is not portable.**
- 82 `'use server'` files (about 22,000 lines, 325 exported actions) plus 11 route handlers.
- They make over 1,000 `.from` / `.rpc` calls, 429 of them on `profiles` alone.
- `profiles` is one row with 312 columns, and 67 tables are named in code.

**Some rules live inline in the actions**, not in `lib/`:
- the catch pipeline and bait save in `fishing/actions.ts` (the biggest file, 2,867 lines);
- dice and DPS checks in `raidMapActions.ts`;
- chest tables and cash-out in `gauntlet/actions.ts`;
- slot reel weights, trader wager odds and the blackjack hand state;
- every currency move.

**Postgres holds real logic.**
- 35 RPCs are called from code (wallet, stat counters, crew XP, one-shot claims, casino
  jackpot). Only about 10 of them are in repo SQL.
- 5 pg_cron jobs:
  - the hourly fish market tick;
  - the hourly Exchange tick;
  - Exchange bet settlement;
  - casino leaderboard refreshes;
  - a premium reconcile that calls an edge function that isn't in the repo.

**Some content is data, not code.**
- Fish species (152), cards (41), card variants (483), crew (32), market prices, and the
  weekly puzzle and trivia boards all live in the database.
- Two storage buckets (about 183 MB of crew, fish and enemy art) are addressed by hard-coded
  Supabase URLs in 22 files. Everything else ships from `public/`.

**Randomness and time are server-side.**
- Rolls use `Math.random`: 39 calls in actions and 31 `lib` modules. Only three places use a
  seeded generator.
- Time comes from `Date.now` (137 calls in actions), plus UTC day keys in 8 files.

**Combat is already client-side.** Raids and gauntlet fights run in the browser. The server
mints run tokens, clamps the hits reported back, and pays out loot.

**External services:**
- Anthropic: nightly trivia and puzzle generation.
- Stripe and Shopify: payments, which go away under premium.
- Supabase: auth (magic link and Google), and Realtime for presence and live profile updates.
- Vercel: crons and analytics.

So the Stardew-style port is less of a rewrite than "nearly every rule is server code"
suggested. The RULES mostly port as they are. What gets rewritten is the layer that loads a
player's state, applies a rule and writes the result: about 22,000 lines of actions, plus the
RPCs and the crons.

### The target shape

One game core, run in two places.

**The core** is plain TypeScript, with no Supabase and no Next.
- A player's state is one typed save (`PlayerSave`).
- Each action is a command: `(save, input, { rng, now }) -> { save', events }`.
- Cast, reel, sell, recruit, send a voyage, cash out a gauntlet: every one is a function over
  the save.

**The web keeps the server as the authority.** A server action becomes four steps: check the
session, load the save slice, run the command with a server seed, write the difference.
Behaviour and security stay exactly as they are.

**Steam runs the same core on the player's machine.**
- It runs against a local save: a JSON save file in the Electron shell, synced by Steam
  Cloud.
- Offline is then the normal case, not a special mode.
- The client calls one `GameApi` interface with two implementations: "call the server action"
  on the web, "run the core locally" on Steam.

**Online becomes optional extras:**
- Sailing with friends, over Steam networking (phase 6 above).
- Leaderboards: either verified runs only (a seeded run whose log the server can replay) or
  Steam's own leaderboards. A local save can be edited, and in single player that only hurts
  the person editing it. That is the Stardew and Terraria bargain.
- Fresh trivia and puzzle packs.
- Contests.

### Decisions this needs (Kong's, none made)

1. **Who is the authority on Steam.**
   - The local save (recommended): Stardew-style, and cheating only affects the cheater.
   - The server, with offline play synced and verified later. That keeps one shared economy,
     but it makes offline a degraded mode and costs far more.
2. **One save across web and Steam, or separate saves.** A local-authority Steam save can't
   flow back into the server-authority web economy without trusting it. The realistic options
   are separate saves, or a one-way import from web to Steam (the phase 2 claim).
3. **An offline answer for each shared-world system:**
   - the fish market's hourly prices and the Exchange: a seeded local simulation;
   - trader rotation: already seeded by sea day, so it ports cleanly;
   - the slots jackpot: local;
   - contests and the Pirate King ladder: online only;
   - weekly puzzles and trivia: downloaded packs plus a bank shipped with the game (see the
     tavern notes).
4. **The calendar.** A device clock can be set to anything, so offline play needs the
   restock-through-play rhythm drafted above in place of UTC daily resets.
5. **Money. DECIDED 2026-09-30:** buying the game on Steam makes you a Captain, and there
   is no store in the Steam build. Gems are removed from BOTH builds: cosmetics become earned
   and utilities cost doubloons. See economy-membership.md, "Gems are being retired". The web
   keeps Captain ($9.99, one-time) as its only purchase.

### Working it through with Kong (started 2026-09-30)

Decisions made together, one at a time. None of it is built yet; each one is also written into
its system's doc.
1. **Money:** buying the game on Steam = Captain; gems are removed from both builds; cosmetics
   are earned and utilities cost doubloons (economy-membership.md).
2. **The calendar:** Animal Crossing runs on the real clock and leaves clock-changing alone.
   The clock trick is accepted: it only affects the player who does it. So some things reset
   WITH PLAY and the rest REFRESH ON A CLOCK:
   - RESET ON COMPLETION: the bounty board and the daily challenges (bounties.md,
     progression.md).
   - SEA DAYS: voyages are measured in sea days, and may bring back an expedition crate
     (voyages.md).
   - REMOVED: the Daily Haul.
   - SEA DAYS: the Tide Turner gives 3 skips per sea day (it was held to 3 a real day for the
     leaderboard, which is going away). The Parlor's Captain's Board deals 1 card per 10 sea
     days (8 real hours) and holds 3, so an unplayed card is never lost.
   - RECRUITS: the board reloads on its own every few sea days (count to set), and CREW
     REROLLS become an item that can drop from expedition crates. This is Darkest Dungeon's
     Stagecoach, adapted: our expeditions aren't its dungeons, so a clock does the reloading.
   - DON'S TRIBUTE IS REMOVED (the Locker perk that paid 10 Fathoms a real day). No refunds
     for the 220 Fathoms paid (Kong).
   - OPEN on recruits: the reload count (10 sea days matches today); whether a reload refills
     only empty seats or replaces the whole group; rerolls from crates only, or also for
     doubloons.
   - HARDCORE GAUNTLET STAYS, and so do Blood Gems, with a new use:
     - The boosted reroll is DROPPED.
     - The 250-Blood-Gem skin gamble becomes SKIN VOUCHERS. Blood Gems buy them, you hold
       them, and redeeming one rolls a random crew skin from EVERY skin, the legendary chase
       skins included at rare odds.
     - A duplicate refunds part of the Blood Gem cost.
     - Vouchers can also drop, very rarely, from crates.
     - Davy's Terms keep multiplying Blood Gems.
     - HARDCORE RUNS: 1 per 10 sea days (8 real hours, today's rate), and unused runs wait,
       up to 3.
     - OPEN: the voucher price, the odds, the refund share, and which crates.
   - LEADERBOARDS: Kong, 2026-09-30: "When we fully migrate to Steam, leaderboards will no
     longer exist." So the direction is now a FULL MIGRATION: the web retires at some point.
     This overrides "the web version is not retiring" above, and no date is set.
3. **Existing web players:** FRESH START, NO GIFT. Kong: "Web is beta. Nothing gets carried
   over. They all know this." Nothing is imported and gem balances simply end. So:
   - phase 2 (identity, the Steam claim) is not needed;
   - the web-to-desktop import (`fromWebExport`) is a testing tool only;
   - the pending Don's-hardcore data repair only matters for the beta.
4. **Content complete, for the Steam launch:**
   - STORY: the campaign rewrite (nodes 32 to 58) must be finished. Chapter 4, the finale's
     dial combat and the Ancient Deep giants are already complete.
   - MULTIPLAYER AT LAUNCH (Kong), over Steam's networking (peer to peer, Valve's relay, no
     server of ours). Each player keeps their own save and earns full rewards in it; nothing
     is split or traded, so local saves cannot be duplicated through it.
     - JOINING: invite to your sea. You open your sea to friends and invite them through the
       Steam overlay, or they join from "Join Game". Joining is the consent: Steam friends
       replace follows, and accepting replaces the pact.
     - AT LAUNCH: seeing each other sail (today's web presence: live boats, arrows,
       arrivals), and FISHING TOGETHER. Being near each other gives a shared bonus while
       each captain casts their own dial; the bonus is to design.
     - CO-OP COMBAT: Kong wants it and it needs real design thinking first. Raids as a pair
       means one game runs the fight and the other follows. The gauntlet is harder still
       (shared boons, cash-out, permadeath on a disconnect). Not committed to launch.
     - NOT AT LAUNCH: homestead visits, trading and gifting.
     - MULTIPLAYER IS ONLY CHARTERS (Kong, 2026-09-30, replacing the guest-visiting rules
       just below). Solo captains are strictly single-player, each in their own world, and
       nobody else sails in it. Everything multiplayer is a Charter, with Charter captains
       that only ever play in that Charter's shared world. The Terraria-style guest rules
       below are kept only as a record of what was considered.
     - THE MODEL (Kong, 2026-09-30, SUPERSEDED for solo captains by "only Charters" above):
       TERRARIA'S, with Animal Crossing's manners for the homestead.
       - Up to 4 captains in a sea, joined by invite.
       - GUESTS SAIL IN THE HOST'S WORLD. They go anywhere the host can, including water they
         have not unlocked, and join the host's fights.
       - Everything a guest catches or earns (fish, doubloons, XP, loot, crew XP) goes into
         THEIR OWN save.
       - The host's world progress stays the host's: campaign nodes, fog, isles, digs, the
         regulars, Finn. Clearing a friend's raid does not clear it in your campaign.
       - The homestead is visited, not changed: you can look around and leave something, and
         only the owner changes it.
       - Talking is pings and emotes, with Steam's own chat and voice. No in-game free text.
       - Fishing together has a nearby bonus and shared moments.
       - OPEN: whether loot from a friend's later chapters is scaled.
       - Kong passed on the shared-world feature list (crew-sized catches, a sea beast, scout
         and angler, fleet voyages, drafting). What he wants instead is GROUP IRONMAN.
     - THE CHARTER (Kong, 2026-09-30): a Group Ironman mode, modelled on Old School
       RuneScape's.
       - Founded at a new game by 2 to 4 friends. The Charter is its OWN WORLD: one campaign,
         one fog, one homestead and one CREW CHEST, all shared by the crew.
       - Each member has their own captain (ship, crew, gear, levels), SEALED to the Charter.
         Nothing comes in from a solo game and nothing goes out; everything the crew owns,
         the crew earned. Specialising pays (one fishes and sells, one raids for gear) and
         the chest joins them up.
       - HARDCORE CHARTER: the crew shares a pool of lives (proposed: one per member plus a
         spare). A sunk ship or a lost raid spends one. When they run out the Charter plays
         on and loses its hardcore flag for good.
       - THE TERRARIA WAY (Kong, 2026-09-30, replacing an earlier "solo play, merged on
         return"):
         - The Charter's world lives on ONE computer, the founder's. The crew plays it when
           the founder hosts, and nobody plays it while the founder is away.
         - So there is one copy, no merging, and chests work exactly like Terraria's: anyone
           can add or take, one person at a time.
         - The founder can hand the world to another member.
         - Why: without a server, solo play meant a copy on every machine and a merge, and the
           chest would have needed rules against two captains taking the same thing apart.
       - THE CREW CHEST holds doubloons, raid items and forge materials, and maybe rods.
         Kong: "we may need to revisit how we do our whole inventory system" (next sitting).
       - THE REGULARS AND FINN are each captain's own: everyone builds their own rapport and
         meets Finn themselves. The campaign is the Charter's.
     - CAPTAINS AND WORLDS (Kong, 2026-09-30):
       - No accounts on Steam: no sign-in, no Google, no linking. You are your Steam account.
       - A CAPTAIN SELECT screen, with as many captains as you like. A new captain's name
         defaults to their Steam name and can be changed in setup.
       - Each normal captain has a HOME SEA (their own campaign, fog and homestead, like a
         Stardew farm per save), played alone.
       - In a Charter, the ALMANAC (catch log, bests, prestige) is SHARED by the crew.
       - BUILT (2026-09-30), the captain select, normal captains only (Charters come with the
         networking):
         - Each captain is one file, `captains/<id>.json` in the save folder; the id is the
           save's uid (`captain-` plus 12 hex for new ones). `desktop/electron/captains.cjs`
           owns the files: list, read, write (atomic, one at a time per captain, newest
           kept), retire. The old single `captain.json` moves in on first start.
         - RETIRE moves the file to `retired/<id>-<stamp>.json`. Nothing is ever deleted; a
           slip is undone by moving the file back by hand.
         - `desktop/src/CaptainSelect.tsx` is the title screen: each captain's avatar, name,
           levels, purse and last played, Play, Retire (asks once), New Captain. It opens on
           launch and at `/captains` (the Nav's Captains link on desktop; the Nav menu's Sign
           Out reads Captains and goes there).
         - Choosing a captain RELOADS the window with the id held in sessionStorage, so no
           screen or Steam state from one captain reaches the next.
         - The Steam name, cut to what a username allows, is offered in the setup's name box
           (`SetupModal` `suggestedName`); the web offers nothing.
     - THE CHARTER, WALKED THROUGH SYSTEM BY SYSTEM (Kong, 2026-09-30):
       - CAMPAIGN: SHARED MAP, PERSONAL CREDIT.
         - When anyone clears a node, the Charter's map advances and the water opens for
           the whole crew.
         - First-clear loot, the chapter-end ship class choice, legendary crew unlocks and
           bounty rungs go only to captains who TOOK PART.
         - Cleared nodes stay re-fightable, so a captain who missed one earns their credit
           later.
         - Story beats play once for those present; the Captain's Log replays them.
       - XP: FULL to every captain in the fight; nothing is split.
       - LOOT: PERSONAL ROLLS, each captain's own crate into their own save. What they do not
         need can go in the crew chest.
       - FIGHTS: every captain present joins with their own ship and crew. The boss grows
         tougher per extra captain, and a captain can take a Charter raid alone at normal
         difficulty. (The Charter only runs while its founder hosts, so "alone" means the
         founder solo, or one captain fighting while the others are elsewhere in the
         session.) Co-op combat itself (turns, targeting) is its own sitting.
       - EXPLORATION: ALL SHARED.
         - The fog lifts for the whole crew wherever anyone sails, and the fog badges count
           the Charter's shared map.
         - One landing claims an isle for the Charter, and one dig claims a site.
         - The caches go into the CREW CHEST.
         - Any captain's bearing (from their own regulars) marks a site on the shared chart.
         - One portal for the Charter, raised by anyone.
         - OPEN: isle caches pay cosmetics under the new economy, so the chest may need to hold
           cosmetics for a captain to take.
       - HOMESTEAD: ONE SHARED BASE, as a Terraria base is. Any captain builds, furnishes and
         arranges it; it all belongs to the crew. (Open detail: whose badges hang in the
         gallery.) PARKED for later: captain's quarters, a personal room per captain.
       - THE SEA'S MARKET: one market for the Charter (it is part of the world).
       - THE ALMANAC: ONE SHARED BOOK.
         - A species is logged once anyone lands it.
         - One personal best per species, with the holder's name.
         - Zone completion rewards pay once, into the crew chest.
         - A GOLDEN is logged with the CATCHER'S NAME on it: the credit is theirs, the book
           is the crew's.
         - PRESTIGE is a CREW VOTE (any captain proposes; everyone present agrees), and its
           boosts apply to the whole crew.
         - The FINALE opens for every captain once the crew's wall holds all six ancients.
       - THE PURSE: DOUBLOONS ARE THE CHARTER'S.
         - Every coin a captain earns (sales, loot coin, rewards) goes into ONE SHARED PURSE,
           which every captain spends from.
         - A CREW LEDGER everyone can read shows who earned what and who spent what.
         - Fathoms and Blood Gems stay each captain's own, since they buy that captain's
           Locker upgrades.
         - ITEMS (raid gear, rods, bait, fish) go into each captain's own inventory and can
           pass through the crew chest. The chest therefore holds items, not coin.
       - CREW: each captain recruits and levels their own. The CREW HALL (hall, drills,
         stores) is the Charter's, upgraded by anyone from the purse.
       - GAUNTLETS: personal Lockers from each captain's own Fathoms. Raid items move through
         the chest.
       - BOUNTIES: ONE SHARED CREW BOARD. Any captain's actions count; finished orders pay
         the purse; the bounty ladder's cosmetics go to EVERY captain when the crew reaches a
         rung.
       - DAILY CHALLENGES: ONE SHARED BOARD the crew completes together, paying the purse.
       - THE PARLOR: PERSONAL. Each captain has their own Board, Capstan, Pirate King, streak
         and rank; pay goes to the purse, and rank rewards are the captain's.
       - THE CHART ROOM: PERSONAL PUZZLES, SHARED WORLD CHART. Every captain's puzzle points
         push the Charter's one World Chart.
       - FOUNDING, JOINING, LEAVING:
         - CHARTER CAPTAINS LIVE INSIDE THE CHARTER'S WORLD, as Stardew keeps farmhands in
           the host's farm. They are saved on the founder's machine and played only when the
           founder hosts. So sealing holds by construction (a Charter captain cannot reach a
           solo game), and a handover moves the world and every captain together.
         - FOUNDING: "Found a Charter" from the title screen. Name it, choose normal or
           hardcore (fixed from then on), and make your Charter captain (Steam name by
           default). The founder hosts a harbour lobby, friends join by Steam invite and
           make their captains (up to 4 berths), and the founder presses SET SAIL.
         - THE ROSTER LOCKS AT SET SAIL: nobody joins afterwards, as in Old School RuneScape's
           Group Ironman.
         - LEAVING: a member who stops playing keeps their berth, and their captain waits
           for them. The founder can release a berth, which shrinks the crew (a locked roster
           cannot refill it).
         - HANDOVER: the founder can pass the whole Charter to another member, who hosts from
           then on.
       - HARDCORE CHARTER:
         - A LIFE is spent when a captain's SHIP IS SUNK: losing a raid fight, or going down in
           a gauntlet dive. Crew lost on voyages do not count; they are already a permanent
           loss of their own.
         - LIVES: one per member plus one, so four captains get five.
         - AT ZERO THE CHARTER SINKS: the world and every Charter captain are gone for good.
           True permadeath.
         - REWARD: a hardcore badge and a crimson Charter flag while it holds.
         - Notes: Steam achievements survive the sinking, since they live on each player's
           Steam account. A founder could restore a copied save; on a local game that cannot
           be prevented, and it only affects that crew.
         - Suggested, not decided: a MEMORIAL on the title screen for a sunk Charter (its name,
           crew, how far it got, where it went down).
       - CO-OP COMBAT:
         - THE HOST'S GAME RUNS THE FIGHT. Every Charter captain lives in the host's world, so
           the host rolls the dice and writes everyone's rewards; the others' games show the
           fight and send their aim presses. No disagreement between machines to settle.
         - A SHARED FIRING PHASE: each round every captain fires at once on their own aim bar
           (a short timer, about 20 seconds), then the boss acts.
         - CREW EFFECTS AND ITEMS NEED A MULTIPLAYER PASS, so heals, shields and boosts can
           reach a crewmate's ship. (Volleys, and a boss that telegraphs its target, were
           suggested but not chosen.)
         - SUNK MID-FIGHT: out for the rest of it, and NO REWARDS from that fight even if the
           crew wins. In a hardcore Charter it spends a life.
         - GAUNTLETS: the crew DIVES TOGETHER, with a shared run, shared boons and a joint
           cash-out decision. To be designed in detail.
         - SETTLED 2026-10-03 (Kong, the expedition campaign sitting):
           - ONE ENGINE, BUILT FOR PARTIES: the port rebuilds combat rather than copying the
             web's 1v1 file (its rules are tangled in a 14,600-line React component with
             unseeded dice, so parity cannot replay it). The web's NUMBERS are kept (damage,
             the aim bar's zones, enemy stats, statuses, mechanic checks, tides); the
             STRUCTURE is new: seeded dice, rules apart from the screen, each round resolved
             into a list of events every captain's screen plays back. Solo is a party of one.
           - THE ROUND: PLAN together (everyone picks an action and maybe a crew ability on a
             short timer, ready-up ends it early), the BROADSIDE (ships fire in initiative
             order along a turn-order strip), then the ENEMY'S TURN.
           - THE BOSS'S TARGET STAYS HIDDEN until it fires (not telegraphed).
           - A SEPARATE BATTLE SCREEN, because a raid and a gauntlet are a set run of enemies;
             but the cut from the sea into it must be SEAMLESS (the same water, light and
             weather carry over, the ships slide from where they were into their line).
           - JOINING ONLY AT THE START OF A RAID: the Charter gathers when a raid begins; no one
             joins a raid already under way.
           - Proposed, not yet confirmed: boss HP x1, x1.8, x2.5, x3.2 for one to four
             captains, a second boss attack a round at three or more, hits the same size.
           - BUILD ORDER: solo combat for Pete's raid, fully animated; then the campaign map on
             the anchorage side (every node kind, scenes, tides, loot, class picks); then
             co-op (gathering, planning together, scaling, crew abilities on a crewmate);
             then co-op gauntlets.
     - THE ITEM SYSTEM (Kong, 2026-09-30; applies to solo captains too):
       - EVERYTHING OWNED IS ONE OF FOUR KINDS:
         - STACKS: counts of identical things (bait, fish, forge materials, raid components).
         - UNLOCKS: owned once, forever (cosmetics, badges, forge recipes, the six special
           items).
         - ONE-OF-A-KIND ITEMS: each with its own details (crew members, goldens with their
           length, forged gear if it gains charges or rolls).
         - UPGRADES: a level, not an item (reel, hook, line, hull tiers, the hold, the Crew
           Hall). Never held or given.
         Equipment slots point at owned things.
       - RAID ITEMS ALLOW DUPLICATES, AND EVERY ITEM HAS A FIXED DROP RATE (Kong, 2026-09-30;
         BUILT as stage 3, see raids-campaign.md):
         - A captain can hold several copies of a piece of gear.
         - What you own no longer drops out of a crate: every unique rolls at its own
           unchanging rate. Today an owned item leaves the table, which makes completing a
           boss's set fast; that goes.
       - RODS ARE ITEMS (Kong, 2026-09-30):
         - Each rod has a name id instead of a "tier" number (the numbers stopped meaning an
           order long ago), with its stats, price, level gate and where it is sold.
         - Held as copies like other gear, duplicates allowed; selling back sells one copy.
         - The equipped rod is a slot pointing at one you own.
         - The Bamboo is a real, unsellable item every captain starts with.
         - The Completionist Rod is a ONE-OF-A-KIND item carrying its own forged effects
           (today they live on the profile).
         - Rods do NOT drop as loot, for now.
         - The web beta keeps its columns, and its store translates ids to the old tier
           numbers; the desktop save gets the clean shape.
         - BUILT (4a/4b, 2026-09-30): ids, copies on both builds, every rod system on the
           inventory. See gear.md. 4c (screens and the API off tiers) is next.
       - A COSMETIC IN THE CHEST IS A TOKEN: the captain who takes it unlocks it. An unlocked
         cosmetic stays with its owner.
       - THE CREW CHEST HOLDS raid items, forge materials, rods and cosmetic tokens. Not bait,
         fish, crew members or upgrades.
     - THE GALLERY: each Charter captain pins their own badges on their own row.
     - BADGES PAY IN ACHIEVEMENT POINTS ONLY (Kong, 2026-09-30; solo too). The Claim button and
       the per-badge doubloons and gems go. Badges earn AP, AP milestones unlock cosmetics
       (extending the colours and boats AP already unlocks), and Steam achievements mirror the
       badges. So a badge stays personal even in a Charter.
       - A Charter captain is a SEPARATE character, sealed to its Charter's world.
       - So today's single save splits into a CAPTAIN file and a WORLD file.
     - THE INVENTORY SURVEY (2026-09-30) found everything a player owns stored six ways:
       - own tables (rods, bait, fish);
       - lists on the profile (most unlocks, and raid items, which cannot be held twice
         although the forge consumes them);
       - one true/false column per special item;
       - structured data columns (crew skins, homestead);
       - plain numbers (reels, hooks, lines, the hull);
       - a list that is really a ladder (repair kits).
       Also: some unlocks are only saved when first equipped, and there are about a dozen dead
       columns and card-era leftovers. The captain/world split and one item system are one
       job: split first, then the item model.
       - STILL TO DESIGN:
         - which state is the WORLD's and which is the CAPTAIN's, per system;
         - the hardcore numbers;
         - how a Charter is founded and joined, and what happens when a member leaves.
   - RETIRED on Steam: contests and the Pirate King ladder (races between players), along
     with the leaderboards.
5. **Quick ones (2026-09-30):**
   - STORE ART is parked until nearer launch: whether to commission the capsule, key art and
     trailer. The AI disclosure is required either way.
   - The physical-pack CLAIM CODES (`/claim`, 100 gems a pack) are RETIRED.
   - The Don's-hardcore cash-out repair is CLOSED as won't fix: the beta resets and nothing
     carries over.
   - The CASINO CHECK resolves itself: with no purchased currency, chips only ever come from
     earned doubloons.
6. Still to come: what "content complete" means, the real
   screens in the desktop window, controller support, store art and the AI disclosure, the
   casino check.

### What can start now on the web (changes nothing a player sees)

In order. Each step is worth doing even if the port never happens.

1. **No new rules in SQL.**
   - New game logic goes in pure `lib/` modules. Postgres keeps only atomic writes, and each
     new one gets a TypeScript twin.
   - The RPCs that exist only in the live database get checked into repo SQL, so the schema
     can be rebuilt from the repo. That is worth doing for disaster recovery on its own.
   - **DONE 2026-09-28:** `web/supabase/live/`, written by `scripts/snapshot-schema.mts`
     (see platform.md). Re-run it after every schema change.
2. **Seeded randomness and an injected clock.**
   - One `lib/rng.ts`, using the mulberry32 generator already in three places.
   - It is passed into every roll module: `crewGen`, `crateLoot`, `voyageRoll`, `fishSize`,
     `shiny`, `raidLoot`, `gauntlet`.
   - The server keeps drawing a fresh seed every time, so odds and behaviour are identical.
   - This unlocks deterministic tests, seeded replays for verified leaderboards, and the
     offline casino and trivia design.
   - **DONE 2026-09-28:** `lib/rng.ts` (`rngNext`, `withRng`, `mulberry32`, `seedOf`) and
     `lib/clock.ts` (`clockNow`, `withClock`). 25 rules modules and 14 server-action files
     roll through `rngNext`, and 17 time-keyed modules read through `clockNow`. Defaults are
     `Math.random` / `Date.now`, so behaviour is unchanged. The override lives on
     `globalThis`, so every loaded copy of the module shares it. SYNC ONLY: never await inside
     `withRng`. `scripts/check-rng.mts` (part of `npm run check`) blocks direct
     `Math.random` / `Date.now()` in those files and proves the same seed gives the same rolls.
     Visuals (particles, audio, camera) keep `Math.random` on purpose.
3. **Content into the repo.**
   - Fish species, cards, card variants and crew become versioned JSON in the repo, and the
     database is seeded from it. A database-only copy has no history anyway.
   - Mirror the two storage buckets into `public/` or an asset manifest. A binary has to bundle
     them, and it removes 22 hard-coded Supabase URLs.
   - **DONE 2026-09-28.**
     - **Content:** `web/content/{fish_species,cards,card_variants}.json`, synced by
       `scripts/content-sync.mts` (pull / diff / push --apply, upsert only). From now on, edit
       the JSON, commit it, then push.
     - **Art:** both buckets, 156 images, converted to WebP in `public/card-arts` and
       `public/enemy-arts` (184 MB became 16 MB). Every reference now goes through
       `lib/artUrl` (`cardArt`, `enemyArt`), which maps the database's `.png` names to the
       `.webp` files. No Supabase storage URL is left in the code.
     - **Check:** `scripts/check-art.mts` (in `npm run check`) fails if a card, skin or
       literal `cardArt` / `enemyArt` has no file on disk.
     - **The buckets are left in place, unused.** Delete them once the new paths have run in
       production for a while.
4. **A save model with export and import.**
   - Define `PlayerSave`: everything a player owns, across `profiles` and its child tables.
   - Add a server export to JSON, and an import.
   - It's useful now for account backups, beta-wipe tooling and admin fixes, and later it
     becomes the Steam claim and the cloud-save format.
   - **DONE 2026-09-28:** `lib/playerSave.ts` defines the format.
     - **What it holds:** the profile row, `SAVE_TABLES` (32 tables in parent-first order) and,
       on request, `HISTORY_TABLES` (22 ledgers and logs, never restored). Shared and social
       rows and anti-cheat tokens are left out on purpose.
     - **The tool:** `scripts/player-save.mts`.
       - `export <user> [--history]` writes to `web/saves/`, which is git-ignored.
       - `restore <file>` is a dry run by default. With `--apply` it writes an undo file first,
         then replaces the account.
     - **Under it:** the service-role-only database functions `admin_export_player_rows` and
       `admin_import_player_rows`. Each is ONE transaction, and ids are kept
       (`overriding system value`).
     - **Proven** with a full round trip on catman: 1,078 rows, 0 differences.
     - **Same account only for now.** Restoring onto another account needs id remapping (crew
       ids live in bunks, trawls and `saved_crew`), and that is the Steam-claim work.
     - **A new table that holds a player's stuff goes in `SAVE_TABLES`.**
5. **Lift the inline rules out of the actions**, one system at a time, core loop first:
   1. fishing (`castLine`, `reelIn`, `reelCrate`);
   2. selling;
   3. crew and recruits;
   4. voyages and trawls;
   5. gauntlet cash-out and chests;
   6. the casino;
   7. raid map dice.

   Each one becomes a pure command with tests, and the action applies the result through the
   existing wallet and RPCs. No behaviour change. This step is the bulk of the work.
   - **Fishing: DONE 2026-09-28.** `lib/fishingRules.ts` holds three functions:
     - `rollCast`: the Ancient Deep pool, crate or fish, the species, the wait, Lightspeed,
       jackpot or double, the Locked-In haul and the Vigil rank.
     - `landFish`: the bait save, shiny, the haul clamped to the hold, the XP and its three
       reported parts, the streak and its record ceiling, the Sigil, the Wormhole, size, and
       the deep's omen.
     - `landAncient`: giant XP, Vigil ranks, and the capstone pet.

     `castLine` and `reelIn` keep auth, the token claim, the reads, the writes and the badges.

     `scripts/check-fishing-rules.mts` (in `npm run check`) runs them against
     `content/fish_species.json` under seeds. It covers determinism, the first cast, the
     giants and the Megalodon gate, stale crates, the zone odds and waits, and the landings
     (the XP parts summing, shiny, the hold clamp, haul priority, the record ceiling and the
     Vigil).

     Verified live on catman: 8 casts, 2 landed, one of them a ×100 jackpot.

     **Then the rest of fishing.** Moved into `lib/fishingRules`: the bite floor
     (`reelTooEarly`), `crateStreak`, `wormholeExit`, `rollCatchSize` and `prestigeStep`.
     `lib/crateLoot` is split into a pure `rollCrateLoot` and `grantCrateLoot`, which the
     crate reel, the weekly crate and the Master challenge share. The only rule left in
     `claimZoneReward` is the already-pure `zoneRewardDoubloons`.
   - **Selling: DONE 2026-09-28.** `lib/sellRules.ts`:
     - the market price, floored PER FISH;
     - sea buyers, floored ONCE over the hold;
     - the runner's cut.

     The market and trader actions use it. `scripts/check-sell-rules.mts` covers the floors,
     the 78-86% resident band (rising with depth, below the market) and the runner's odds.

     Verified live on catman. A jackpot filled the hold exactly to capacity (208 to 250),
     then the market's Sell all paid exactly the listed 4,228.
   - **Crew: DONE 2026-09-28.** `lib/crewRules.ts` covers:
     - the card pools;
     - the recruit board roll, including the campaign gate, the empty-group fallback and the
       one-shot gifted legendary;
     - the Blood Gem skin pick;
     - finished stints and stint payouts (the level ceiling is freed but not paid);
     - the Leviathan trait offer.

     `crew/actions` and `lib/crewBunkSettle` use it. `crewBunkSettle` re-exports `BunkRow`,
     `TraitUpgrade`, `NEUTRAL_OFFER` and `bunkTerms` for the old imports.

     `scripts/check-crew-rules.mts` checks the following against `content/cards.json`:
     - no legendary on a free board;
     - no gated legendary before its chapter;
     - the gift pinned to slot 0;
     - the GEM weights over 60,000 faces;
     - the gamble never paying a legendary or an owned skin;
     - the hall's payouts.

     Verified live: a fresh free board rolled for catman (one Rare, two Commons).
   - **Voyages and trawls: DONE 2026-09-28.** The event roll was already pure
     (`lib/voyageEvents`), and so was the trawl haul (`fishing/trawls/constants`).

     `lib/voyageRules.ts` covers:
     - `planVoyage`: the route gates, the crew minimum, the effect-lifted crew, the event
       roll, the doubloon bonus, and the duration with Swift Sails;
     - `voyagePayout`: Navigation and crew XP by route and outcome, bait, the special items
       (only once), and the survivors;
     - `voyageBack` and `voyageCrewCap`.

     `lib/trawlRules.ts` covers:
     - the trawler's Savvy and Fortune;
     - the deploy gates, in their order (the Ancient Deep's campaign gate is still worked
       out in the action, since it reads the database);
     - the return time;
     - the haul's species.

     `scripts/check-voyage-rules.mts` checks:
     - determinism and the gates;
     - no loss on Coastal or with Safe Passage (the Shroud does lose hands);
     - Swift Sails at exactly 15% off;
     - the payouts by outcome, the xp bonus, lost hands unpaid, and specials only once;
     - the timing, and the trawl refusals in order.

     Verified live on catman: an Inner Sea voyage sailed at 1h 19m with 410 ⟡ (the card said
     1h 19m and 253-422). Revealed, it paid exactly the triumph's 375 Nav XP, 410 ⟡ and 3 ◆.
     A trawl was not sent live, since sending needs the ship at the Trawl Docks.
   - **Gauntlet: DONE 2026-09-28.** The run itself was already pure (`lib/gauntlet`,
     `gauntletOffer`, `gauntletTerms`). What moved is the SETTLEMENT that lived inline in
     `raids/gauntlet/actions`. `lib/gauntletRules.ts` covers:
     - the run clock, the four-second depth floor, and `settleDepths` (the Veteran's Start
       bound on the combat depth);
     - `runFathoms` (the Fence tab);
     - `cashOutHaul`: the chest, the chase drops in their FIXED roll order (a seeded replay
       depends on that order), Blood Gems, doubloons, Nav XP, gems, Fathoms and crew XP;
     - `recordClaim`, the cooldown, the shrine's coin and the Don's feats.

     Still inline: the hardcore runs-per-day count uses the UTC date (`new Date()`). It
     belongs with the calendar-to-session restock decision above, not with this move.

     `scripts/check-gauntlet-rules.mts` checks:
     - the depth clamps and determinism;
     - no hardcore chase or Blood Gems on a normal run, and no Davy cannon on the Don's;
     - nothing owned dropping twice;
     - the pot ceiling, pay stopping at the reward cap while the record keeps going;
     - the offer honoured only at its own depth;
     - Pressure moving Blood Gems and nothing else;
     - records, the cooldown, the gap cap and the shrine's even odds.

     Live: catman's gauntlet page loads on the new code with DESCEND open and no server
     errors. No cash-out has been played since; the first real run after 2026-09-28 is the
     live proof (compare its `gauntlet_runs` row against the reward screen).
   - **Casino: DONE 2026-09-28.** The card maths (`lib/blackjack`) and the wheel
     (`lib/roulette`) were already pure. `lib/casinoRules.ts` covers:
     - the purse: the buy-in rule, and the session bust-out all three games share;
     - `rollSlots`: the reels, the bonus round with the wild, and the pay table. The shared
       community pot is still claimed by the action, since a pot many players feed is a
       database thing (offline it becomes a local pot);
     - the roulette slip and its per-zone cap;
     - the blackjack table: deal, insurance, hit, stand, double, split, the orphan stand, the
       settlement and the badge streaks.

     `scripts/check-casino-rules.mts` checks:
     - determinism;
     - the forced triples, and the pot (an admin never takes it);
     - the wild never completing a catfish line;
     - the base-game return (87.4% before the pot; the 10% feed returns through it, near the
       ~96.8% total the constants state);
     - the zone cap, the purse, and every blackjack house rule.

     Verified live on catman: four slot pulls. A catfish pair paid 3x, sardine pairs came up
     near misses, and the purse moved 120 to 95, exactly the four stakes less the one win.
   - **Raids: DONE 2026-09-28. PHASE B IS COMPLETE.** Combat runs on the client and its
     maths were already pure (`raidDamageProfile`, `rollCrate`, the `lib/bossRaids` configs).
     `lib/raidRules.ts` covers what the server decides:
     - a kill's reward from the config, with class and Renown scaling;
     - the crate: uniques, the coin clamp, the currency row, and item coin;
     - the clear records;
     - the map's node gate, the dice throw, and the damage check's preview and shot.

     The forge and Ultimate timers now read the seam clock.

     `scripts/check-raid-rules.mts` walks EVERY raid and every dice and damage node. It
     checks:
     - each round pays its own line, and the Helmsman scales gold only;
     - owned uniques never drop again, and a gem row pays no coin;
     - the coin claim clamps, and admin clears never take the record;
     - the d20 is fair, and no purse goes below zero.

     **Found by the check, fixed 2026-09-28 on Kong's OK:** the damage-check sheet
     UNDERSTATED the odds. It needed a roll of `ceil(threshold / mult)` while the shot passes
     on `round(roll x mult) >= threshold` (`coffers_fork` showed 29% and passed about 32%).
     `dpsPreview` now counts rolls with the shot's own rounding, and the check holds the two
     within 1.5 points.

     Not live-tested: every changed path fires only inside a fight or at a map node, so the
     first raid anyone plays after the deploy is the proof.
6. **A data-access layer.** Per-system read and write functions replace the scattered
   `admin.from('profiles')` calls, so a local store can later stand in for Supabase behind the
   same functions.
   **STARTED 2026-09-28.** The shape: one `lib/data/<system>Data.ts` per system, holding an
   interface of NAMED operations ("take one bait", "claim this cast", "add to the hold")
   plus its Supabase implementation, with the old queries moved verbatim and every one-shot
   condition kept. Actions call `db.claimCast(...)` rather than a table query. An offline build
   supplies the same interface over a local save. Shared helpers keep their homes:
   `lib/wallet` (balances, owned lists), `lib/badgeGrant`, `lib/anomaly`.
   - **Fishing: DONE 2026-09-28.** `lib/data/fishingData.ts`; `fishing/actions.ts` no longer
     names a table. The one-shot conditional writes became named operations with the
     guarantee in their contract: `claimCast`, `claimCrateCast`, `claimPendingReroll`,
     `flagOn` (zone rewards, special items), `moveLevelWatermark` (level rewards),
     `raiseHoldTier` (a floor), `takeFromHold` (the wormhole's guard against a sale in
     between) and `resolveShiny`. An offline store has to honour each of these as stated.
     Verified live on catman, twice. After the first slice, 9 casts took exactly 9 worms, and 3
     landings logged 3 species and filled the hold 2 to 106 (two doubles and a x100 jackpot,
     new and existing rows). After the whole file, 8 casts took 8 worms, and 3 landings logged
     3 and put 6 in the hold. Trophies, prestige and the shops were not driven live.
   - **Shared: `lib/data/common.ts`** holds `CaptainData` (the profile row, counters, the
     ledger, raid clears, bait), which every system's interface extends.
   - **Selling: DONE 2026-09-28.** `lib/data/sellData.ts`; the market and the sea traders (the
     salter, residents, the blockade runner, and the chart's position save that lives beside
     them) no longer name a table. Its contract: stacks are taken only if they still read
     what was seen; the whole-hold sale pays for exactly the rows removed; a deal key's second
     claim reports `taken`; the coin deduction returns null when the purse is short.
     Verified live on catman: Sell all on 112 fish paid exactly the 2,156 the price table
     gives, with the hold emptied, the lifetime stat and the ledger line matching.
   - **Crew: DONE 2026-09-28.** `lib/data/crewData.ts`; the Crew Hall, its bunks, promotions,
     the chart's crew hub, and the shared helpers every system calls (`loadDeployedParty`,
     crew XP, bunk settlement) no longer name a table. Seats are addressed by TRACK
     ('voyage' | 'raid'), never by column. Its contract: the board's date moves only from
     the date read; a candidate is claimed only while unclaimed; the legendary gift is
     spent only if still set; a tier steps only from the tier read; a bunk is claimed only
     at the `since` read, and XP pays only for bunks removed; an open trait offer is never
     overwritten and is answered once.
     Verified live on catman: a voyage sailed with exactly the five seated hands in seat
     order, and its reveal paid each of them exactly the route's 230 crew XP.
   - **Voyages and trawls: DONE 2026-09-28.** `lib/data/voyageData.ts` holds `VoyageData` and
     `TrawlData`, both over `CrewData`; `voyageActions` and the trawl actions no longer name a
     table. Contract: a second voyage launch while one is out reports `taken`; the reveal
     flips once and only the flipper pays; a trawl is collected once and only the collector
     is paid.
     Verified live on catman: a triumph voyage launched and revealed paying exactly 422 and
     3 gems with 288 crew XP to each of the five hands; a finished Shallows trawl (planted by
     hand, since sending needs the Docks) collected from the day board with its XP, coin,
     ledger line and counter all landing and its row gone.
   - **Gauntlet: DONE 2026-09-28.** `lib/data/gauntletData.ts` over `CrewData` (the hardcore
     squad is crew); the gauntlet actions no longer name a table. Contract: `closeRun` closes
     an OPEN run once, and only the closer pays, drowns a squad or logs the run; the Don's
     tribute stamps once per UTC day; the best hit only ever rises; a squad drowning touches
     only the living and reports how many.
     Verified live: catman's gauntlet page reads the same through the store as before (deepest
     82, the ledger tops, DESCEND open, no server errors). A cash-out was NOT driven live,
     since it needs a played dive and would spend catman's daily run; the first real finish
     after 2026-09-28 is the proof.
   - **Casino: DONE 2026-09-28.** `lib/data/casinoData.ts`; slots, blackjack, roulette and the
     chip purse no longer name a table. Contract: a blackjack hand settles once and only the
     settler is paid; the table saves only while the hand is active; the cash-out moves every
     chip in one step; the community pot's share and new size come from one atomic claim
     (offline, the pot is a local one).
     Verified live on catman: four slot pulls took the purse 95 to 20 (four stakes, one
     two-hook refund), the session net fell exactly 75, the community pot rose exactly 12
     (four feeds of 3), and all four spins were logged.
   - **Raids: DONE 2026-09-28. EVERY PHASE B SYSTEM NOW HAS A DATA LAYER.** `lib/data/raidData.ts`
     (`lib/runToken` kept as thin wrappers over it); raid clears, kills, loot, the cleared set,
     player stats, the campaign map, the forge and Accelerator, the Ultimate build, the berth
     and armory, spoils and repair kits no longer name a table. `CaptainData` gained
     `updateProfileIf`: a declarative guard list (`is null`, `eq`, `not null`, `contains`)
     that every one-shot purchase, build and node clear uses, and that a local store turns
     into a WHERE. Contract: the run token pays each round, clears, opens its crate and is
     consumed once each, and refuses an expired token.
     Verified against production directly through the store: catman's cleared raids, the
     raid records, and the store's own fastest-clear (dkmuppy on the Throne, 2,018,018 ms)
     agree with the database's aggregate; a guard that does not hold writes nothing, one that
     holds writes, and the profile was left unchanged.
7. **The `GameApi` seam on the client.** Components call `api.castLine()` instead of importing
   the server action directly. On the web the implementation is the server action, so this is
   a rename, not a behaviour change.
   **STARTED 2026-09-28, fishing first.** `lib/gameApi` exports one `api` object. Its
   `FishingApi` interface is typed straight off the server actions (`typeof castLine`...), so a
   second implementation cannot drift from the first without the compiler saying so. The web
   implementation IS the server actions. The fishing screen, loadout, chart, shipyard, golden
   choice and the gauntlet's special-item buy now call `api.fishing.*` (24 call sites); no
   component imports the fishing actions any more (`bootActions` is server code and keeps
   calling directly). The Tide Turner is `api.fishing.tideTurnerSkip`, not `useTideTurnerSkip`,
   so the hooks lint does not mistake it for a hook.
   The swap for Steam is a build-time alias of `lib/gameApi`'s implementation module; not built
   yet, that is the step 8 spike.
   Verified live on catman: 8 casts through `api.fishing` took 8 worms, and 2 landings logged
   and put 4 in the hold.

   **STEP 8 SPIKE, STAGE 1 DONE 2026-09-28: the cast and the reel run offline.**
   - `lib/core/fishing.ts` holds `castLine` and `reelIn` with nothing of the web: the store
     (`FishingData`) and the captain's id are arguments, and the shared helpers they used
     (wallet, badges, anomaly flags, the day's challenge override) became store operations.
     The server actions are now thin wrappers: check the session, pass the Supabase store.
   - `lib/data/local/fishingLocal.ts` implements `FishingData` over a plain save object,
     honouring every one-shot contract.
   - `installRng` / `installClock` install the save's seeded dice and a clock process-wide,
     for the one-player offline process only (never on the web server).
   - `scripts/check-offline-fishing.mts` (in `npm run check`) walks the core's import tree
     (no Supabase, no Next, no server action on it), fishes 80 casts on a local save checking
     bait, hold, log, XP and the one-shot claims after every one, and replays the seed to the
     identical save.
   - Web verified live after the change: 9 casts, 9 worms, 3 landings including a x100.
   **Found by the spike (to fix, none blocking):** the core stamps a few timestamps with the
   real clock rather than `clockNow`; `reelCrate` is not in the core yet (the crate loot grant
   still takes the Supabase client); offline there is nobody to rank against, so the top-three
   nudge answers nobody.
   **STAGE 2 DONE 2026-09-28: the save is ONE JSON FILE** (Kong chose it over SQLite: the save
   is already one document, it is small, it needs no dependency, and it is the Stardew model
   Steam Cloud syncs; SQLite can come later behind the same interface if saves grow).
   - `lib/data/local/saveFile.ts` (pure): a format name and version; a file that is not a
     save, or is from a newer game, is refused; older versions upgrade in order (MIGRATIONS);
     it stores player state only, re-attaching the species from content on load; web tables
     the offline core does not model yet are CARRIED verbatim so nothing is lost.
   - `SaveStorage` is where the text lives: `nodeSaveStorage` (tests, tools) writes
     atomically (temp file, flush, rename); the shell supplies one through Electron's main process.
   - `fromWebExport` turns a web account's export (`scripts/player-save`) into a local save.
   - The check now quits at cast 40, reloads from a ~3.5 KB file into a new store, and must
     end exactly where an unbroken session does; an interrupted write leaves the old save
     whole; catman's REAL converted export (146 species, 21 rods, 22 tables carried) fished 20
     casts offline, landing all 20.
   **STAGE 3, THE SHELL, DONE 2026-09-28 (Electron).** `desktop/` at the repo root (not a second
   game). Tauri was tried first and dropped the same day: it needs Rust plus the MSVC build
   tools, and its webview differs per OS. Electron ships one Chromium everywhere, has
   steamworks.js for Steam, and is the path Vampire Survivors, Cookie Clicker and CrossCode took.
   The decision on 2026-09-28: WRAP, do not rewrite. A native (Godot) rewrite was weighed and
   set aside; revisit only for consoles or if Steam sales justify it. REVERSED 2026-09-30:
   Kong chose Godot once multiplayer was at launch (see the top of this page).
   - A Vite + React front end, NOT a static export of the Next app (that would drag every server
     page in). Its `@` resolves into `web/`, so the core, the local store, the save file, the
     rules, the content and the REAL dial (`components/FishingDial` DialSVG) are the website's
     own files; React is deduped so the dial shares the app's copy.
   - The seam in action: `@/lib/gameApi` is aliased to `desktop/src/localGameApi.ts`, which
     answers `api.fishing.castLine` and `reelIn` from the core and the save (the rest answer
     that they are not offline yet). The screen imports `api` exactly as the website does.
   - `desktop/electron/main.cjs`: serves `dist/` over a private `app://game/` scheme (not
     file://), owns the saves (one per captain, `captains/<id>.json` in the app data folder since the
     captain select, written atomically: temp,
     fsync, rename), and locks the page down (context isolation, sandbox, no Node, no navigation
     away, outside links open in the browser). `preload.cjs` exposes ONLY `window.stbSave`
     (list, retire, and where, read, write by captain id) and `window.stbSteam`. `desktop/src/saveStorage.ts` uses it, or localStorage in a plain
     browser.
   - Commands (in `desktop/`): `npm run app` builds and opens the window; `npm run app:dev` is
     the Vite dev server with hot reload inside the window; `npm run dist` makes the Windows
     installer (NSIS) and `npm run dist:dir` an unpacked build in `release/`.
   - TRAP: VS Code's terminals export `ELECTRON_RUN_AS_NODE=1`, which starts Electron as plain
     Node (`protocol` is undefined). Even an EMPTY value counts; the launchers
     (`electron/start.mjs`, `dev.mjs`) delete the variable.
   - Everything the page needs is bundled, so the package's `dependencies` must stay EMPTY
     (all devDependencies): otherwise electron-builder ships node_modules (it did: 17 MB asar,
     now 720 KB). The unpacked build is ~370 MB, nearly all Electron's own Chromium.
   - Verified in the REAL window (puppeteer over the remote debugging port): the page has
     `stbSave` and no `require`/`process`, zero requests outside app://, casts through the core,
     two Bluegill landed (283 XP, 1 species), and a relaunch came back from the file exactly
     (283 XP, 54 worms, 2 in the hold) with no temp file left. The packaged exe opens the game.
   - Probe note: a fast needle cannot be timed with puppeteer's keyboard (the per-frame dial
     re-render delays input by hundreds of ms); the probe dispatches the keydown from inside the
     page at the moment the needle is in the band.
   **ALL OF FISHING OFFLINE, 2026-09-28.** Every `api.fishing` call now runs in the core:
   `lib/core/fishing` gained the crate, the wormhole, the Tide Turner, the golden choice
   (held, sell, mount) and the level rewards; `lib/core/loadout` holds boats, bandanas, pets,
   the special slot, the Completionist forge and the two preferences. The actions are thin
   wrappers (session, then the core with the Supabase store; `revalidatePath('/sea')` stays in
   the action, as the one web-only step). The crate grant is shared through
   `lib/crateLoot` `grantCrateLootTo(store)` (the weekly and Master crates still call
   `grantCrateLoot(admin)`, which adapts the client). FishingData gained `spend`, any owned
   list in `addToList`, and `achievementPoints` (offline: the badges held). The core's
   timestamps now come from `clockNow`. check-offline-fishing section 5 exercises each call and
   its one-shot guard; verified against production as catman through the real store (a
   wooden crate opened once, a golden sold once, the rest round-tripped and restored). The
   desktop's `localGameApi` answers every fishing call, and `desktop/tsconfig.json`
   (`npm run typecheck`) checks the shell with one React for both trees.
   NOT on the API yet (still direct server-action imports): quickBuyWorms, claimZoneReward,
   prestigeZone, releaseAncient, the tour flags, checkLeaderboardPosition, syncFishHold.
   **SELLING OFFLINE, 2026-09-29.** `lib/core/selling`: the market (whole hold, per species),
   the resident buyers, the wandering traders (claim, daily cap), the blockade runner, and
   `saveSeaPosition` (it lived in the trader actions and uses the same store). The actions are
   thin wrappers; the market ones still settle the retired delayed lane first (web-only table,
   never written offline). `api.selling` carries them; the sea chart, the trader panel, the
   market screen and the pending-sales watcher call it.
   - THE MARKET OFFLINE is the captain's own. On the web it is shared and the hourly cron
     `update_fish_market()` moves it; `lib/marketRules` is that SQL ported line for line (moods
     at the same odds and 2 to 5 hours, drift 8% to par, rarity volatility, clamp 0.40..2.50,
     cents, 24-deep history). The local store catches it up by the whole hours since it last
     ticked, capped at 48 (the drift has erased anything older).
   - `lib/data/local/save.ts` now holds the save's shape and `localCaptain` (CaptainData plus the
     wallet, lists, badges), spread by every local store. The SAVE FILE IS VERSION 2 (deals,
     market); a v1 file upgrades on load. Deals older than a week are pruned (their keys carry
     their day and can never be claimed again).
   - `scripts/check-offline-selling.mts` (in `npm run check`): the import trees, 5,000 market
     ticks and the mood odds against the SQL's, the catch-up, every lane and its guard, and the
     v1 to v2 upgrade. Verified against production as catman (one fish sold, one peddler deal,
     the chart position round-tripped and restored).
   - Found on the way: `update_fish_market()` was executable by anon and authenticated. It ran
     with the caller's rights and RLS has no update policy on the market tables, so a client
     call changed nothing, but it was revoked (2026-09-29) to match every other cron function.
   **THE CREW OFFLINE, 2026-09-29.** `lib/core/crew`: the board (free once a day, the paid and
   blood-charged rerolls, the gifted legendary, the blood skin gamble), recruiting, the roster,
   seats on both tracks, clear/bench/promote/rename/dismiss, crew the deck, the graveyard, the
   hall upgrade, bunks and the Leviathan re-cut, drills and stores, crew skins, promotions. The
   crew, bunk and promotion actions are thin wrappers (`revalidatePath('/sea')` stays in the
   hall and ladder ones); `api.crew` carries them to the Crew Hall, the ship screen, the crew
   panel and the hall sheet.
   - `lib/crewBunkSettle` and `lib/crewXPGrant` now take the crew STORE, not the admin client
     (`grantXPToSeatedVia` / `grantXPToIdsVia`; the admin-taking `grantXPToAssignedCrew` /
     `grantXPToCrewIds` remain as wrappers for voyages, raids and the gauntlet until those move).
     CrewData gained `spend`, `grant`, `addToList`. `stampBadges` moved to the pure
     `lib/badgeStamps` (badgeGrant re-exports it); the local `grantBadge` now dates badges too.
   - `lib/data/local/crewLocal`: the card catalogue from `content/cards.json`; the
     `grant_crew_xp_*` SQL as arithmetic; the web table's unique keys on bunks. SAVE FILE v3
     (crew with the fallen, recruits, bunks, one `nextId` counter; a v2 file upgrades and gets
     the hall's web defaults). A web export's crew convert with `nextId` past every web id.
   - NOT YET OFFLINE: voyages and trawls, so offline no hand is ever at sea or on a trawl, the
     graveyard cannot name the route, and `crewHub` (it reads both) stays web-only for now.
   - `scripts/check-offline-crew.mts` (in `npm run check`) and a production probe as catman
     (reads, a seat and a skin round-tripped and restored).
   - The desktop now carries a save's unmodelled web tables through every write (it dropped
     them before, so a converted account would have lost them on the first autosave).
   **VOYAGES AND TRAWLS OFFLINE, 2026-09-29.** `lib/core/voyages`: the daily voyage (state,
   send, reveal, the board), trawls (the docks, send, collect) and `crewHub`, the crew's roll
   call. The voyage, trawl, voyage-board and crew-hub actions are thin wrappers; `api.voyages`
   carries them to the voyage panel, the trawl indicator, the chart, the crew panel and the
   Charterhouse board.
   - THE CAPTAIN'S LOG stays web-only: it is an AI call. `revealVoyageResults` in the core
     returns `{ result, log }`; the web action schedules `generateAndSaveVoyageLog(log)` with
     `after()`, the desktop drops it, so an offline voyage simply has no log.
   - `loadDeployedPartyVia(store)` (the admin `loadDeployedParty` wraps it for raids and the
     sea page). VoyageData gained `revealedVoyages` and `grantBadge`; `seaCrewData(admin)` is
     voyages and trawls as one store for the roll call.
   - `lib/data/local/voyageLocal` (one store for both, spreading the crew's): one ship at sea,
     a reveal flips once, one trawl per zone and per hand, a trawl claimed once. The crew store
     now reads the save's voyages and trawls, so the at-sea and trawl locks hold offline and
     the graveyard names the route. SAVE FILE v4 (voyages, trawls); a v3 file upgrades.
   - `scripts/check-offline-voyages.mts` (in `npm run check`), including a voyage that loses a
     hand; a production probe as catman (reads and refusals only: a send or reveal would move
     real rewards).
   **THE GAUNTLETS OFFLINE, 2026-09-29.** `lib/core/gauntlet`: Davy's and the Don's lobby,
   start, checkpoints and per-depth times, pause and resume, Davy's Offer, the cash-out and
   the death (hardcore squads drown), the Locker, the tribute, the Shrine's coin, the Fence,
   the leaderboard node. The actions are thin wrappers; `api.gauntlet` carries them to
   GauntletGame. GauntletData gained `logBountyEvent`, `grantBadge`, `flagAnomaly`; crew
   purses include `gauntlet_fathoms`.
   - The raid loadout loader moved to the store-agnostic `lib/raidLoadout`
     (`getRaidPlayerStatsVia(store)`); `lib/raidPlayerStats.getRaidPlayerStats(userId)` wraps it
     for the web and re-exports the types. `settleUltimateBuildVia(store)` likewise.
   - `lib/data/local/gauntletLocal`: `bump_gauntlet_hit` and `record_gauntlet_depth_best` as
     arithmetic; offline the ledger is the captain's own best cashed-out run. SAVE FILE v5
     (per-depth times, run log, bounty moments; the last few hundred of each).
   - FIXED ON THE WAY: a hardcore cash-out's faster same-depth time and its best-Pressure check
     read Davy's hardcore columns on a Don's run; they now use `hcCols(variant)`. Two players had
     40 Don's hardcore cash-outs under the old code, so their Davy hardcore best time may have
     been overwritten by a Don's time, and their Don's best time / Pressure may not have been
     updated. Not repaired (needs Kong's call).
   - `scripts/check-offline-gauntlet.mts` (in `npm run check`); production probe as catman (reads
     and refusals only).
   **THE DEN OFFLINE, 2026-09-29.** `lib/core/casino`: the shared chip purse (buy-in against
   the day's cap, cash-out), Fish Slots and the community pot, Fish Roulette and Blackjack
   (every move, the settlement, orphan hands). The four tavern action files are thin wrappers
   (`revalidatePath` stays in the slots, purse and deal wrappers); `api.casino` carries them to
   the blackjack table, roulette, the slot machine and the Den lobby. CasinoData gained
   `spend`, `grant` and `grantBadge`. Blackjack's mid-hand view now reads the profile once
   instead of five separate reads (same values).
   - `lib/data/local/casinoLocal`: `casino_cash_out`, `slots_feed_jackpot`,
     `slots_claim_jackpot` (share = pot x wager / max bet, floored; never below the seed) and
     `get_slot_stats` (running totals) as arithmetic. THE COMMUNITY POT offline is the
     captain's own, seeded at 15,000 like the web's. SAVE FILE v6 (`casino`: recent buy-ins, the
     open hand, the last twenty roulette spins, slots totals, the pot).
   - `scripts/check-offline-casino.mts` (in `npm run check`): 400 spins, 300 roulette spins and
     500 blackjack hands, each proving every chip is where the nets say; production probe as
     catman (reads and refusals only).
   **RAIDS AND THE CAMPAIGN MAP OFFLINE, 2026-09-29.** `lib/core/raids`: the run token,
   each round's kill pay, the clear, the crate, the biggest hit, repair kits, the three raid
   tutorials. `lib/core/raidMap`: the map view and every node type (milestones, story reads and
   legendary gates, puzzles, the Quartermaster's pick, the muster, events, forks, dice, the DPS
   gate, the scout's debt, class picks), the refit, and the Sunken Hand's spoils. Eight action
   files are thin wrappers; `api.raids` carries them to RaidGame, RaidCombat, the practice raid,
   the dice/DPS/refit/spoils panels, the ship screen's repair kit, the sea's story and node
   sheets, the chart and the shipyard.
   - RaidData now extends CrewData (the party, the loadout, crew XP) plus `flagAnomaly` and
     `logBountyEvent`. Store-agnostic helpers: `lib/raidCleared.buildClearedSetVia` (the web's
     `lib/raidProgress.buildClearedSet` wraps it); `lib/ultimateBuild` loads the Supabase store
     only inside its web wrapper, so the loadout loader stays server-free.
   - `lib/data/local/raidLocal`: the run token keeps every one-shot the web's `run_tokens` row
     has (`claim_run_token_round`, `bump_run_token_kill`, the clear, the loot, the spend) and its
     six-hour life; offline the records (`raid_records`, the fastest clear) are the captain's
     own. SAVE FILE v7 (run tokens of the last week; clears with their times, `clears` kept as
     the list); a v6 file keeps its clears, untimed.
   - `scripts/check-offline-raids.mts` (in `npm run check`) walks the WHOLE campaign offline:
     all 64 nodes, raids cleared through the token path, each node once. Production probe as
     catman (reads, refusals that flag nothing, one token minted and spent).
   **THE SHIP AND THE SHIPYARD OFFLINE, 2026-09-29.** `lib/core/ship`: the raid loadout, the
   Forge (learn for Fathoms, forge from parts), the Abyssal Accelerator (charge, claim), the
   ultimate (build, free re-pick, settle on read, retool, the Full Schematics, the free switch),
   the Sixth Berth, the Expanded Armory, hull skins, the one-time guides, the Shipyard's four
   ladders and the rod you fish with. `expeditions/actions` and `shipyard/actions` are thin
   wrappers (the Shipyard's `revalidatePath('/sea')` stays in the web wrapper); `api.ship`
   carries them to ShipHero, the berth, armory and ultimate panels, the sea chart's ultimate
   celebration and the Shipyard.
   - `lib/data/shipData`: RaidData plus the rods carried. `lib/data/local/shipLocal` spreads the
     raid store. No new tables.
   - THE SHIPYARD'S FITTED-TIER WRITE is now `updateProfileIf` on the tier just re-read, which
     is how a store says a write did not land; a refit that does not land hands the coin back
     (the old code read the Postgres error for the same purpose). Two taps racing: the second
     now refunds instead of landing one rung higher.
   - SAVE FILE v8: no new tables; the ship's profile columns get the database's column defaults
     where a save never had them (`SHIP_PROFILE_DEFAULTS`, a fresh copy per save). Without this a
     new offline captain's `has_sixth_berth` read as missing, not `false`, and every guarded
     purchase refunded itself.
   - `scripts/check-offline-ship.mts` (in `npm run check`); production probe as catman (reads and
     refusals only, each spending call made only where the profile shows it must refuse; the
     profile was byte-identical after).
   - The legacy card-collection crew picker (`getCollectionForCrew`, `saveCrew`) moved to the
     core too but is not on the API: no screen calls it.
   **THE DAILY LOOP OFFLINE, 2026-09-29.** `lib/core/bounties` (the board, its meters, a
   claim, the one swap, the points ladder, the rung announcement) and `lib/core/dailies` (the
   daily challenges and the sweep, the Daily Haul's gems, bait and weekly crate, the disc's
   state, the mailbox, the contests). `bountyActions`, `dailyChallengeActions`,
   `actions/dailyBonus`, `actions/mail` and `tavern/contests/actions` are thin wrappers;
   `api.dailies` carries them to the bounty panel and rung celebration, the chart, the Daily
   Orders, the Daily Haul, the mail inbox, the Nav pip and the contests page.
   - `lib/data/dailyData`: RaidData plus the challenge rows and their guarded flags, a stamp
     that lands once per day or week (`stampIfNew`), the bounty board (claim slot, swap, the
     logs its meters read), the mailbox and the contests view.
   - `lib/data/local/dailyLocal`: the meters read the save's own logs (raid clears with times,
     revealed voyages, bounty events, profile counters). Offline the mailbox is the captain's
     own (the game is the only sender) and the contests show this captain against the goal.
     Local `profile('*')` now returns the whole row (the bounty meters read any counter).
   - The swap now reports a write that did not land (it used to answer success).
   - SAVE FILE v9: the bounty board and its history (sixty boards), when each contest was won,
     the mail as full letters (id, read, claimed, attachments), and the loop's profile columns
     at the database's defaults (`DAILY_PROFILE_DEFAULTS`).
   - `scripts/check-offline-dailies.mts` (in `npm run check`): every rung's board, each order
     finished from the logs its meter reads and paid once; checked to fail when a claim guard
     is broken. Production probe as catman (reads and refusals, profile unchanged).
   - The sea's boot and day aggregators (`sea/bootActions`, `sea/dayActions`) still call the
     web actions server-side; they convert with the sea stage.
   **THE PARLOR OFFLINE, 2026-09-29.** `lib/core/parlor`: the Captain's Board, Spin the
   Capstan, the Pirate King and the rank claims. The four trivia action files are thin wrappers;
   `api.parlor` carries them to the board, the capstan, the King, the rank claim and the lobby.
   - THE QUESTIONS OFFLINE come from a shipped bank, `content/trivia.json`, because the web's
     come from Claude each week. `scripts/export-trivia-bank.mts` refreshes it from production
     (every week that passes the generators' shape checks, no question repeated across weeks);
     `lib/triviaBank` hands each week one entry of each list in turn. First export: 18 boards,
     14 ladders, 11 capstan sets, so the offline Parlor repeats after about three months unless
     the bank is refreshed before a build. The bank is imported only by the local store, and the
     website's browser bundles were checked to hold none of it.
   - `lib/data/triviaData`: DailyData plus badges, the week's questions (the generators on the
     web, the bank offline) and each game's attempt row, moved only from the exact state read.
   - SAVE FILE v10: each game's attempt per week (twelve weeks kept) and the Parlor's profile
     columns at the database's defaults (`PARLOR_PROFILE_DEFAULTS`).
   - `scripts/check-offline-parlor.mts` (in `npm run check`); checked to fail when a payout or
     any of the three race guards is broken. Production probe as catman (reads and refusals,
     the profile and the week's rows unchanged).
   **THE CHART ROOM OFFLINE, 2026-09-29.** `lib/core/chartRoom`: Treasure Match (the run
   replayed from its swaps), the Minefield, the Quartermaster's Hold, Lay the Rigging, the World
   Chart's landmark claims and the room's guide. Six action files are thin wrappers;
   `api.chartRoom` carries them to the four puzzles, the World Chart and the lobby.
   - ALL FOUR BOARDS ARE BUILT BY CODE (no Claude), so offline the save builds its own each week
     and keeps it: `lib/chartBoards` is now the one builder, called by the web's cached
     generators and by the local store alike. The Minefield, Hold and Rigging engines rolled
     `Math.random`; they now roll `rngNext` (unchanged on the web, seedable offline) and
     `check-rng` guards them.
   - `lib/data/chartData`: DailyData plus badges, the week's boards and one operation per
     guarded write, each web query copied verbatim.
   - SAVE FILE v11: the boards the save built and each puzzle's attempt per week (twelve weeks),
     and the room's profile columns at the database's defaults (`CHARTING_PROFILE_DEFAULTS`). A
     web export keeps what was banked or solved and drops half-done grids, since they point at
     cells of the web's board, which the save never had.
   - `scripts/check-offline-chartroom.mts` (in `npm run check`): each puzzle solved through the
     real engines (an honest Treasure Match run played swap by swap), every store guard tested
     directly; checked to fail when a guard or a payout is broken. Production probe as catman
     (reads and refusals, none that flag; the profile and the week's rows unchanged).
   **THE SEA'S OWN OFFLINE (first half), 2026-09-29.** `lib/core/sea`: the nine regulars (a
   visit a day, a job asked, a fish delivered, a friend's rod), Finn (his meetings, jobs measured
   as deltas, the hand-in, the reveal, including `fishing/finnActions.markFinnRevealSeen`),
   bottles and digs, going ashore, the portal's ladder, the free recall, and Kip's question.
   Eight action files are thin wrappers; `api.sea` carries them to the chart, the folk and trader
   panels, Finn's sheet, Kip and the fishing screen's reveal.
   - `lib/data/seaData`: DailyData plus badges, rods and one operation per guarded write (a day's
     chat, a settled job, the last fish, a once-ever rod, unique bearings and isles, a dig, the
     recall's cutoff), each web query copied verbatim.
   - `lib/data/local/seaLocal`: Finn's catch counts come from the save's lifetime log and species
     list; "landed since the ask" from the catch log's last-caught stamp.
   - SAVE FILE v12: the regulars' FULL rows (a v11 save kept only who wanted which fish, so its
     points start from nothing), bearings and digs, isles been ashore at, the homestead, and the
     sea's profile columns at the database's defaults (`SEA_PROFILE_DEFAULTS`).
   - `scripts/check-offline-sea.mts` (in `npm run check`); checked to fail when any of seven
     store guards is broken. Production probe as catman (reads and refusals, nothing moved).
   **THE SEA'S OWN OFFLINE (second half), 2026-09-29.** `lib/core/seaSheets`: the two tours'
   latches and steps (only ever forwards), the loadout sheet, the raid sheet, a campaign node's
   sheet and the boss card (both off the map's own read), and the Day board. Six action files
   are thin wrappers (the tour's `/sea` revalidation stays in the web wrapper); `api.sea` now also
   carries the tours, the sheets, the Day board, the arrival read (`seaBoot`) and pacts to the
   chart, the tour cards, the market, the loadout, the sheets and the pact board.
   - THE DAY BOARD TAKES ITS READERS AS INPUTS (`DaySources`): the web hands it each system's
     action, the desktop each system's local API, so the board can never disagree with the sheet
     it opens. The once-a-day full-day credit is a store operation (`creditFullDay`).
   - `seaBoot` offline is composed in the desktop's API from the same readers. PACTS STAY ONLINE:
     they are between players, so offline there is nobody to ask (no pacts, no one's homestead to
     visit); the local API says so rather than failing.
   - `lib/dayList` now reads `DayState` from the core.
   - The sea check covers the tours, the sheets, the boss card and the Day board's once-a-day
     credit (checked to fail when that guard is broken). Production probe as catman (reads, tour
     writes sent behind the stored step, nothing moved). The loadout's achievement points sit
     behind Next's request cache, so a probe outside the app stands in 0 for that one read.
   **THE HARBOUR OFFLINE, 2026-09-29.** `lib/core/harbour`: the tackle shop (bait, rods bought
   and sold back, reels, the Completionist, the rod in hand), the hook bench, the fish hold (its
   upgrade and its contents), the Shipyard's hulls and name, the Angler's Almanac, the Shipyard's
   state and the ship screen's props. Seven action files are thin wrappers (their page
   revalidations stay on the web); `api.harbour` carries them to the tackle shop, both Shipyard
   screens, the ship screen and its sheet, the Almanac and the fishing screen's hold.
   - The tackle shop's `equipRod` is `api.harbour.equipTackleRod` (the Shipyard's is
     `api.ship.equipRod`).
   - THE SHIP SCREEN'S PROPS ARE SHAPED IN THE CORE FROM PIECES (`shipHeroProps`): on the web
     the pieces are the per-request caches the hub page shares with the ship screen
     (`expeditions/hubData`), so the roster is still fetched once; the desktop reads them from its
     stores (`shipHeroPieces`).
   - FIXED ON THE WAY: `buyBait` looked the bait up with `getBait`, which falls back to worms, so a
     made-up bait name was sold at the worm price and stocked under that name. It now needs an
     exact match. Production held no such rows (checked 2026-09-29).
   - The save's lifetime log now keeps each species' first-caught date (optional; older saves have
     none), for the Almanac's dates and NEW marks. No version bump.
   - The practice skirmish (`raids/practice`) is admin-only on the web and stays there.
   - `scripts/check-offline-harbour.mts` (in `npm run check`); checked to fail when a rod guard,
     the sell rate or the trader rule is broken. Production probe as catman (reads and refusals,
     nothing moved).
   **THE REST OFFLINE, 2026-09-29.** Every screen now reaches the game through `api`; no client
   component imports a server action except the admin screens.
   - `lib/core/progress`: Renown (state, allocate, commit, respec and its token), badges
     (reconcile from the store's `badgeSignals`, rewards, the raid feats the client may unlock,
     wearing), the unlock banner's `checkUnlocks`, the setup flag, the welcome gift and the
     member's daily pack. The gift and the pack are now written guarded, then paid in place (they
     used to write a gem total read earlier). Respec had the same stale read and is fixed the same
     way. On the web `api.progress.checkUnlocks` still fetches `/api/unlocks`.
   - `lib/core/homestead`: build, rename, furnish, pin, with the house guarded on the tier it
     was priced against. `lib/core/profile`: the username, the showcase, skins, avatar colours and
     specials, the backdrop, the user search.
   - The Almanac's zone reward, prestige and the Long Vigil's release moved into
     `lib/core/fishing` (`api.fishing`). Prestige is now written guarded on the reward flag, so
     two taps on one completion cannot both count.
   - `lib/data/local/progressLocal` reads the badge signals from the save's own records. Offline
     every well-formed name is free and a search finds nobody.
   - `api.online` holds the calls between players or through a payment provider. On the web
     each one is the server action. The desktop answers each one honestly instead of failing:
     - the leaderboards return an error saying they need the internet;
     - following and visits have nobody to follow or visit;
     - the Exchange is a closed Board;
     - checkout says it is bought on seasthebooty.com;
     - membership and gems are read from the save;
     - the activity ping does nothing;
     - the honeypot says 'Nothing here.' and flags nobody.
   - Web-only, not in `api`: admin and dev tools, the practice skirmish, `bootActions` (the
     desktop composes its boot from the local API) and the dead `shipBonus`. Also left alone are
     seven exported fishing actions with no caller: `settlePendingCatchCredit`, `quickBuyWorms`,
     the three tour flags, `checkLeaderboardPosition` and `syncFishHold`.
   - `scripts/check-offline-progress.mts` (in `npm run check`) covers all of it, including the
     Almanac. Production probe as catman (reads and refusals, nothing moved).
   - CORRECTION: what runs offline is every system's RULES and the whole `api`. The desktop
     WINDOW still shows the spike's small fishing screen (`desktop/src/App.tsx`), not the
     game's screens. Mounting the real screens in the shell is its own stage. They are Next
     pages whose data is loaded on the server, so each one needs its loading moved onto `api`.
   **THE REAL SCREENS IN THE SHELL, STAGE 1: THE SEA CHART (2026-09-30).** The desktop
   window now runs the game's own screens instead of the spike.
   - STAND-INS FOR NEXT (`desktop/src/shims`, swapped in by `vite.config.ts` and
     `tsconfig.json`, so the screens are type-checked against them):
     - `next/navigation` works over the window's own history. `router.refresh()` re-runs
       the screen's loader without remounting, as a refreshed server page does.
     - `next/link`, `next/dynamic` (React.lazy) and `next/image` (a plain img).
     - `@/lib/supabase/client` is a quiet stand-in that answers every query with nothing.
       The Nav, the live profile feed and the presence layer reach for it; offline they
       sit still.
   - THE FRAME (`desktop/src/Shell.tsx`) plays both web layouts: first-run setup and the
     welcome, the Nav, the preloader, the coach, the unlock banner, crew promotion, the
     doubloon guide and AppChrome's watchers. Left out: the Stripe checkouts, the session
     watcher, the honeypot and analytics.
   - SCREENS (`desktop/src/screens.tsx`): a path, a LOADER that builds the page's props
     from the save, and the page's client component. Only `/sea` so far; any other path
     shows "not aboard yet" with the way home.
   - THE SEA PAGE'S PROPS are shaped in `lib/core/seaPage` (`seaMapProps`) from pieces, like
     the ship screen. The web's `/sea` page keeps its one parallel batch of reads (with the
     cached species) and hands them over; the desktop reads the same pieces from the save
     (`seaPageProps` in `localGameApi`).
   - `electron/main.cjs` answers any extensionless path with index.html, so a screen's URL
     survives a reload. Save writes are queued and coalesced: parallel autosaves raced
     through one temp file and lost the rename.
   - Fonts ship as local files (@fontsource: Cinzel, Karla, Pirata One). The web's
     `public/` folder (152 MB of art and sound) is served and packaged as is.
   - PIXI UNDER app:// (`desktop/src/pixiPaths.ts`): Pixi only counted http(s) as a web
     address and resolved '/sea/x.webp' to app://sea/x.webp. Its check now counts app://.
   - `desktop/src/localGameApi` re-exports EVERY type the web's Game API does
     (`export type *`), since the real screens import many more than the spike did.
   - Checked: `npx tsc` in desktop covers the whole chart tree. The dev window and the
     packaged exe both load the chart with no errors, and first-run setup and the welcome
     go through to it.
   **STAGE 2: THE ROOMS (2026-09-30).** Every room a player reaches now opens in the shell:
   - the market and the tavern;
   - the tackle shop, the shipyard, today's orders and the homestead;
   - both gauntlets;
   - the Den: lobby, slots, roulette, blackjack;
   - the Chart Room: lobby, the Hold, the Rigging, Treasure Match, the Minefield, the World
     Chart;
   - the Parlor: lobby, the Board, the Capstan, the Pirate King;
   - badges, the Captain's Log and the profile.

   How they were brought over:
   - THE PATTERN: a web page that did more than hand props over is split. The page keeps
     its reads (and its caches); what it builds from them goes into a shared builder:
     `lib/core/marketPage`, `lobbies` (Chart Room and Parlor), `gauntletPage`, `badgesPage`,
     plus `homePageProps` and `profilePageProps`. Any page markup becomes a view the desktop
     reuses: ChartingFrame, GameFrame, SlotsView, RouletteView, BlackjackView,
     CaptainsLogView, TackleShopView, BadgesView. The tackle shop's page is one core
     function (`tackleShopProps`) that both builds run on their own store.
   - BADGES: the ~600-line goal computation moved verbatim into `lib/core/badgesPage`, fed
     from the store's `badgeSignals` (the same reads the page made). Its two self-healing
     writes are store operations. Global rarity is about other captains, so the web reads
     it and offline it is empty. `check-badge-goals` and `BADGES.md` point at the new file.
   - SPLIT FOR THE CLIENT: `MOOD_CONFIG` moved to `lib/marketMood`, and blackjack's fish art
     to `lib/blackjackFishArtPool`. Both had been pulling a server read into a client
     component.
   - The tavern composes its parts in the shell (`desktop/src/rooms/Tavern.tsx`). The
     leaderboard ticker, contests and the support card retire on Steam; the crew digest
     waits for Steam friends. `SaltRoadDigestView` is split from its server read.
   - ONLINE-ONLY rooms say so plainly (`rooms/OnlineOnly.tsx`): the leaderboards, contests,
     your crew and other captains' pages. Retired routes redirect as on the web.
   - Captain-only rooms (the Rigging, the Capstan) redirect a non-Captain exactly as on the
     web.
   - Checked: every room opened in the real window with no errors, and the gauntlets were
     also opened on an unlocked copy of the save.
   - NO LEADERBOARDS ON STEAM, AT ALL (Kong, 2026-09-30): `web/lib/platform` `IS_DESKTOP` (set
     only by the desktop's Vite config) hides every way in. That covers the Nav tab, the phone
     tab bar, the profile's link, the gauntlets' Records mooring and the Exchange's Ranks.
     `/leaderboard` and `/tavern/contests` redirect to the chart. On the web the flag is always
     false. Use it only for what Steam decisively does not have; the rules never branch on it.
   - RAID FIGHT PAGES ARE NOT NEEDED (Kong): all 19 campaign fights open inline on the chart
     (checked against `lib/raidRegistry`), so `/raids/krust` and the rest are dead fallbacks.
     The desktop has none; the web still carries them, harmlessly.
   - THE STARTER SAVE IS A FRESH WEB ACCOUNT (2026-09-30). `content/profile_defaults.json` is
     the `profiles` row at its column defaults, all 312 columns, parsed from the schema
     snapshot by `lib/profileDefaults`. It gets the set_default_username name and the sign-up
     trigger's 25 worms, and no rods beyond the Bamboo. One Steam difference: the captain
     starts as a Captain (the purchase is the membership).
     - WHEN `profiles` CHANGES: re-run `scripts/snapshot-schema.mts`, then
       `scripts/export-profile-defaults.mts`. `check-profile-defaults` (in `npm run check`)
       fails until the file matches the snapshot.
   - THE NAV READS THE SAVE OFFLINE. Its per-screen read (the avatar's look, the purse,
     badges waiting to be claimed, voyages out) moved into `lib/navState`. The web keeps the
     browser-client read, with no server round trip per click. The desktop swaps the module
     for `desktop/src/shims/navState.ts`, like the database client. Checked: selling in the
     market moved the Nav's purse at once. The starter save is still the spike's (Lv 5,
     500 doubloons) and should match a fresh web account (and on Steam, be a Captain).
   **THE STEAMWORKS LAYER, 2026-09-29.** `steamworks.js` 0.4.0 in the desktop shell.
   - `desktop/electron/steam.cjs` (main process): starts Steam, relaunches a packaged build
     through Steam if it was opened outside it, switches on the overlay, and answers three
     calls from the page (`window.stbSteam`): status, unlock, presence. With no App ID or no
     Steam running, every call does nothing and the game plays the same.
   - THE APP ID is `steamAppId` in `desktop/package.json`, null until the store page exists.
     `STB_STEAM_APPID=480` runs against Valve's public test app (Spacewar) for a quick check.
     That proves the bridge and the overlay, but 480's achievements are Valve's, and Steam will
     show you as playing Spacewar while it runs.
   - ACHIEVEMENTS: the Steam API name IS the badge id, so there is no mapping table. Every save
     write sends any badge in `unlocked_badges` that Steam has not been told about
     (`desktop/src/steam.ts`). The first write after opening sends them all, so an imported web
     save or badges earned while Steam was closed catch up on their own.
   - RICH PRESENCE: in port, fishing (with the zone), on a raid, running the gauntlet, at the
     tables in the Den. The text is `desktop/steam/rich_presence.vdf`.
   - OVERLAY COST: turning on the overlay makes Electron draw the GPU in-process and repaint
     every frame. That only happens when Steam is actually running. Watch frame rate there.
   - THE SAVE FOLDER IS PINNED in `electron/main.cjs` to `%APPDATA%\seas-the-booty-desktop`
     (the name the dev and packaged builds already used), so renaming the package cannot move
     every player's save.
   **Partner-site setup, once there is an App ID** (no code, all on partner.steamgames.com):
   1. Put the App ID in `desktop/package.json` `steamAppId`.
   2. Achievements: `npx tsx scripts/steam-achievements.mts` (in `web/`) writes
      `desktop/steam/achievements.csv` (243 rows: API name, name, description) and
      `desktop/steam/achievement-icons/` (earned and greyed JPGs, git-ignored, 256px; change
      `ICON` there if the partner page asks for another size). Steamworks has no bulk upload,
      so these are entered by hand. Decide which story badges should be HIDDEN (spoilers); the
      list does not guess.
   3. Rich presence: upload `desktop/steam/rich_presence.vdf` as the English localization.
   4. Steam Cloud, Auto-Cloud: quota about 100 MB, 50 files (a new save is about 13 KB; raise
      the file count if players keep more captains). Root `WinAppDataRoaming`, subdirectory
      `seas-the-booty-desktop/captains`, pattern `*.json`, not recursive. Add the same for
      `MacAppSupport` and `LinuxXdgConfigHome` if those builds ship. Never include `*.tmp`
      or `retired/` (retired captains stay on the machine).
   - NOT YET: Steam Input (controller) and the Deck, and the real screens in the shell.
8. **Restock through play** (drafted above), when Kong is ready to make that design call.

**Then the spike** (phase 3's week, updated):
- Electron (Tauri tried and dropped, see stage 3) plus a JSON save and a Vite front end over `web/`.
- `GameApi` pointed at the local core for ONE system (fishing), running with the network off.
- The point is to prove the path and surface the surprises while they are cheap.

### Size, roughly

- **Steps 1 to 4:** a few weeks, all low risk.
- **Steps 5 to 7:** the bulk, measured in months. They can be done system by system alongside
  normal work, each step shipped to the web with behaviour unchanged.
- **After that:** porting the RPCs, crons and shared-world systems to local equivalents, once
  the core runs locally.
- **On top:** phases 1 to 7 above (money, identity, input, Steam features, networking, the
  store) still apply.

### Rules while this is prepped

- New game rules go in pure `lib/` modules with injected randomness and time. Never inline in
  an action, and never in SQL.
- New content goes in the repo, not only in a table.
- New art goes in `public/`, not a storage bucket.
