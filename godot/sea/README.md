# The Sea — the exploration hub

A Godot 4 project. The overworld: your boat on open water, sailed by tapping
where you want to go. Eventually you sail to a fishing zone, to expeditions, to
the tavern, and docking navigates the web app to that screen.

Lives **outside `web/`** on purpose so nothing here is ever bundled into the
Next.js app. The only thing that crosses over is the exported build.

## What phase 1 is, and what it deliberately is not

**Is:** a boat, open water, a camera, tap-to-sail.

**Is not:** destinations, docking, gating, art, crew, sound.

That absence is the point. The one question this build answers is *does floating
around feel good on a real phone*. If it does not, nothing in the phases below
rescues it, and it is far better to learn that in an afternoon than after the
map is drawn. Resist dressing it up before you have an answer.

## Building it

1. Open `godot/sea/project.godot` in Godot 4.3 or newer.
2. Press play. You should be able to tap the water and sail there.
3. To put it in the app: **Project → Export → Add… → Web**, then export to
   `web/public/sea/index.html`.

**Turn Thread Support OFF in the export preset.** Threaded builds need
`SharedArrayBuffer`, which needs `COOP`/`COEP` headers site-wide, and
`Cross-Origin-Embedder-Policy: require-corp` breaks the Stripe embedded checkout
in `MembershipModal`. Single-threaded is slower and costs nothing anyone else
has to think about. Only revisit this if frame rate forces it, and then check
what it does to checkout first.

The route at `/sea` is **admin only** and tells you plainly when the build is
missing, so a fresh clone does not just show a black rectangle.

`web/public/sea/` is gitignored — the export is a build artifact, not source.

### If the editor says "Failed to load script"

On a fresh clone, `.godot/` does not exist yet, so no global class names are
registered and `sea.gd`'s reference to `Boat` cannot resolve. **Opening the
project in the editor once fixes it** — the import pass registers the class and
everything loads on the next run.

Only an issue for headless/CI use, where you need an editor pass first:

```
Godot_v4.x_console.exe --headless --path godot/sea --editor --quit
```

Parse-check a single script the same way:

```
Godot_v4.x_console.exe --headless --path godot/sea --check-only --script res://scripts/sea.gd
```

## Testing it on a phone

Tap-to-sail cannot be judged on a laptop. Get it on glass early.

**Over wifi, no deploy.** From `web/`:

```
npm run dev:lan
```

then open `http://<your-machine-ip>:3000/sea` on a phone on the same network.
`next dev` binds to localhost only, which is why the `:lan` variant exists.

Two things that bite: a VPN on the desktop (NordLynx, Tailscale and friends)
will usually stop the phone reaching it, so drop it first. And Windows Firewall
may prompt the first time — allow it on private networks.

**On the live site.** `web/public/sea/` is gitignored, so an export never
reaches Vercel. That is deliberate for now: a web export is tens of megabytes
and every re-export would be a fresh blob in git history, which is a bad trade
while the numbers in `boat.gd` are still moving.

When it is worth putting in front of someone else, two options:

- **Commit the build.** Un-ignore the folder and accept the blob. Simplest, and
  fine if exports are rare by then.
- **Serve it from Supabase storage**, the same way art already gets uploaded.
  Keeps git clean and the iframe just points at the bucket URL. Needs the origin
  check in `SeaFrame.tsx` widened to the storage host, since it would no longer
  be same-origin.

## The contract with the web app

One message each way. That small surface is the main reason this feature is a
good first Godot project.

**App → Godot**, at load: what the player can reach. Fishing level, unlocked
zones, chapter progress, last boat position. Not written yet.

**Godot → app**, on docking:

```gdscript
JavaScriptBridge.eval("parent.postMessage({type:'dock',to:'fishing:abyss'},'*')")
```

`SeaFrame.tsx` already listens for that and maps it to a route. The listener is
in place before the sender so the contract is settled and visible while the
Godot side is written against it.

## Where the feel lives

Everything worth arguing about is five exported numbers in `scripts/boat.gd`:

| | |
|---|---|
| `max_speed` | Sets how big the map may be. The longest crossing anyone tolerates is about ten seconds. |
| `accel` | Low is heavy. A boat should take a moment to get going. |
| `turn_rate` | Deliberately slow. Snap to a heading and it reads as a cursor. |
| `slow_radius` | The gap between this and `arrive_radius` is the whole feeling of coasting into a berth. |
| `cam_lead` (in `sea.gd`) | The camera leads the boat, so you see where you are going. |

Tune these before adding anything else.

## Roadmap

1. **Sail.** ← you are here
2. **Destinations.** Markers, a dock interaction, the bridge, route change.
3. **Gating.** Locked zones visible but fogged. `ZONE_MIN_LEVEL` is 1 / 15 / 30
   / 50 / 75, and the same rule the raid map follows applies: a locked thing
   stays *visible* as a goal, because hiding it hides the reason to chase it.
4. **Dressing.** The player's equipped boat skin and hat. Weather. Time of day.
5. **Life.** Crew on deck, trawls out on the water where they were actually
   sent, other captains passing.

## Two rules

**Only places go on the map.** Fishing zones, expeditions, the tavern, the
market, the crew hall. Not badges, leaderboards, social or profile — a
leaderboard is not somewhere you sail to, and putting menus on a map only makes
navigation slower.

**Never trap anyone.** The tab bar stays, permanently. Somebody holding 200 fish
who wants to sell them must never have to cross a map to do it. The hub should
be the nicest way to move around, never the only one.
