# Tide Run iOS Port — Kickoff Doc

A self-contained brief for porting the existing web Tide Run minigame to a native iOS app (Swift + SpriteKit). Paste this into the first Claude Code session on the Mac.

---

## What you're porting

A Canabalt-style endless side-scroller. You're a boat sailing right. Tap to jump rocks, hold to jump farther over shoals, time it right to land between clustered shoals. Beacons "detect" you mid-air if you fly over them. Currents slow you down briefly. Distance = score (in meters).

**Live on web today** at `web/app/(app)/tavern/tide-run/`. The original game logic + tuning constants are in `web/app/(app)/tavern/tide-run/TideRunGame.tsx` (canvas-rendered, ~2300 lines). Read that file first — it is the spec.

---

## v1 scope (MVP)

Ship the game in 4 phases. Don't try to do all of this at once.

1. **Core loop** — boat scrolls right, gravity + jump, one obstacle type (small rocks). Death = game over screen with score. No audio, no progression, no menu.
2. **Full hazard set** — medium/large rocks, shoals, shoal clusters, beacons, currents. Hazard spawn cadence + warmup gates (see "Hazard spawning" below).
3. **Polish** — wake particles, splash on landing, hit-stop on smash, screen shake, sound effects, parallax sky/clouds, day-night cycle.
4. **Surround** — Game Center leaderboard, AdMob banner + interstitial, $0.99 IAP remove-ads, settings screen, App Store metadata.

---

## Recommended tech stack

- **Language:** Swift 5.x
- **Game framework:** SpriteKit (native, free, ships with Xcode, perfect for 2D)
- **Audio:** AVAudioEngine for SFX (matches the web's Web Audio approach)
- **Leaderboard:** Game Center (`GKLeaderboard`) — free, native, easy
- **Ads:** Google AdMob (`GoogleMobileAds` SDK via SwiftPM) — banner during menu, interstitial on death (skip on first death so the first impression isn't an ad)
- **IAP:** StoreKit 2 — single non-consumable product `com.shiblinggames.tiderun.removeads`
- **Local storage:** UserDefaults for settings + high score (no backend needed for v1)
- **No backend** — the web version uses Supabase for global leaderboards; native uses Game Center instead

---

## Physics (must match the web feel exactly)

Constants from `TideRunGame.tsx` lines 25-31. Port these into Swift verbatim:

```swift
let GRAVITY                  = 2800.0  // px/s² full gravity (after hold release)
let JUMP_IMPULSE             = 590.0   // px/s upward kick when jump starts
let JUMP_HOLD_GRAVITY_MULT   = 0.30    // gravity multiplier while finger is held
let JUMP_MAX_HOLD_SEC        = 0.40    // hold beyond this no longer extends the jump
let BASE_SPEED               = 290.0   // px/s starting horizontal scroll
let SPEED_RAMP               = 5.0     // px/s² gentle climb over time
let MAX_SPEED                = 1500.0  // soft cap (reached ~3 min in)
```

**Key model:** the boat itself doesn't move horizontally — the world scrolls left under it. Boat sits at `x = canvasWidth * 0.13` (13% from left = lots of lookahead room).

**Jump model is hold-to-extend.** On touch down → set `velocityY = -JUMP_IMPULSE` and start the hold. While held, gravity is `GRAVITY * 0.30` (slow rise). On release OR when held past `JUMP_MAX_HOLD_SEC`, gravity returns to full. This gives short taps for small jumps + long holds for max-distance jumps. Don't use SKPhysicsBody for this — hand-roll it in `update(_:)`. SKPhysicsBody can't easily express variable gravity per-body without fighting it.

**Sea surface uses two sine waves** (constants line 36-42):
```swift
y = base + sin(x / 560 * 2π) * 18 + sin(x / 940 * 2π) * 7
```
Amplitude scales 1.0 → 1.25 across the first 8000 px traveled (calmer at start, choppier as you go). Reference: `seaSurfaceY()` function in the web file.

---

## Hazard catalog

All hazards are right-edge-spawned at intervals of `HAZARD_SPAWN_SPACING = 360` world px (with reaction-time floors).

### Rocks (jump over)
Three tiers — small / medium / large. Different heights, different approach buffers.
- `TIER_SMALL_ONLY_M = 25` — first 25m: small only
- `TIER_NO_LARGE_M = 90` — 25-90m: small + medium, no large yet
- `APPROACH_BUFFER_MED = 80`, `APPROACH_BUFFER_LRG = 240` — extra approach px before bigger rocks
- `MIN_REACTION_TIME_SEC = 0.55` (small), `+0.10` (medium), `+0.30` (large)

### Shoals (jump over, wider than rocks)
Tap-clearable (narrow) or hold-clearable (wide). 20% spawn chance per slot, no shoals before 50m.
- `SHOAL_MIN_WIDTH = 80`
- `SHOAL_CLEARANCE_FRACTION = 0.70` — max width is 70% of full-hold distance
- Clusters: 35% of shoals become 2-3 shoal chains past 140m, with safe-landing gaps of 165-235 px between them

### Beacons (signature mechanic)
22% spawn chance per slot, only after 75m. Detect-and-wreck if you're airborne directly over them. `BEACON_DETECT_FLASH_SEC = 0.55` — half-second beam plays before the death overlay so the player sees the loss.

### Currents (slow zones)
12% spawn after each hazard. Visual sea-current band that drops your scroll speed temporarily. Width: 18-32% of canvas width.

### Spawn safety rules (don't skip these)
- Never spawn a shoal/beacon within `MIN_REACTION_TIME_SEC + buffer` of the previous hazard
- Don't spawn two beacons back-to-back (player feels cheated)
- Don't spawn a beacon in the middle of a shoal cluster (impossible to clear)

---

## Audio assets to bring over

All in `web/public/`:
- `tidesfxbeaconcatch.mp3` — beacon detection wail
- `tidesfxbeaconcrash.mp3` — beacon smash
- `tidesfxsplash.mp3` — landing on water
- `tidesfxcrash.mp3` — death (rock/shoal smash)
- `silent.ogg` — NOT needed on native (only used to work around iOS PWA audio-session bug)

Native iOS has no PWA audio-session gymnastics. Just load each SFX as an `AVAudioPlayerNode` buffer and `scheduleBuffer` on play.

---

## Visual assets

- `web/public/boatrun.png` — boat sprite (trimmed, 1031×672 ratio)
- Sky / cloud / water are all canvas-drawn in the web version — port them as SKShapeNode + SKAction.move for clouds, or pre-render as PNGs

---

## SpriteKit architecture sketch

```
TideRunScene : SKScene
├── worldNode (single SKNode; everything except UI is its child for easy scroll)
│   ├── seaNode      (custom SKShapeNode redrawn each frame for the wave)
│   ├── skyNode      (parallax gradient + clouds)
│   ├── hazardNodes  (rocks, shoals, beacons spawn here; removed when off-screen left)
│   ├── currentBands (semi-transparent rectangles)
│   ├── wakeParticles (SKEmitterNode at the boat's bow)
│   └── splashBursts (SKEmitterNode pool, one per landing)
├── boatNode         (fixed screen X, moves only vertically)
└── hud
    ├── scoreLabel
    └── pauseButton

update(_ currentTime: TimeInterval):
    1. dt = currentTime - lastUpdate
    2. apply scroll: scrollX += speed * dt
    3. apply gravity to boat velocityY (with hold mult if held)
    4. boat.position.y += velocityY * dt
    5. spawn hazards if scrollX > nextSpawnAt (using same logic as web)
    6. cull hazards off-screen left
    7. check collisions (boat AABB vs hazard AABBs — simpler than SKPhysics)
    8. update wake/splash/debris particle ages
    9. update score label every 180ms
```

---

## Things you can skip for v1

- Per-run gem rewards (Small Fishes economy, not native)
- Wreck-screen rank vs other players (use Game Center "your rank" instead)
- Daily commit lockouts (the "one run per day" rule on web — native should be free play)
- Doubloon rewards for beacons (no economy yet — just count beacons smashed for a Game Center achievement)
- All Supabase persistence
- Tour / first-time onboarding overlay (do this in v2 once the game feels right)

---

## Monetization wiring (when you reach phase 4)

### AdMob
- Banner: bottom of the main menu only (not during gameplay — frame-rate killer + immersion break)
- Interstitial: on every 3rd death (not every death — that's hateful)
- Both gated behind `UserDefaults.standard.bool(forKey: "removeAdsPurchased")`. If purchased, no ads anywhere.

### StoreKit 2 IAP
- One non-consumable product. Localized to $0.99 (USD) — Apple sets equivalents in other regions.
- Add a "Remove Ads — $0.99" button in settings
- Add a "Restore Purchases" button (App Store will reject without one)
- Test with sandbox Apple ID in Xcode before submission

### Privacy + ATT
- ATT prompt required if you use personalized ads. Show it on first launch after a brief context screen ("we show ads to keep the game free — tap Allow for personalized ones").
- Privacy Nutrition Label in App Store Connect: data collected = none if you skip analytics, just "Diagnostics" if you use Crashlytics.

---

## Phase 1 first session goal

When you open the new Xcode project for the first time, tell the next Claude session:

> "I'm porting the web Tide Run minigame to native iOS as a learning project. Here's the kickoff doc [paste this file]. I have the source repo at `~/Projects/shiblinggames/` and a new empty Xcode project at `~/Projects/TideRunIOS/`. Let's start with Phase 1: a SpriteKit scene with the scrolling sea + boat + jump (no hazards yet, no audio). Read `web/app/(app)/tavern/tide-run/TideRunGame.tsx` for the physics constants and seaSurfaceY function."

That should get you to a playable empty world in one session.
