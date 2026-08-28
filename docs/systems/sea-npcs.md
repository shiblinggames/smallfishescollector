# The Salt Road — NPCs on the ocean hub

The people you meet out on `/sea`. Code: `web/lib/seaTraders.ts` (who is where and what
they want), `web/lib/seaClock.ts` (the sea's day), `web/app/(app)/sea/traderActions.ts`
(every value mutation), `TraderPanel.tsx`.

---

## Nobody is a row

Whether a cell of ocean holds someone today, who they are, what they look like and what
they are asking are all derived by **hashing (cell, day)**. Nothing is stored, nothing is
scheduled, no job runs at midnight.

That is cheap, but the reason it matters is safety: the client sends a **trader key and
nothing else**, and the server re-hashes the cell and rebuilds the person and the price for
itself. A price is never something the client asserts. `traderFromKey` returns null unless
the key it regenerates matches the key it was given.

`CELL = 1500` world px, one trader max per cell. Density is a **bell**, not a ramp — it
peaks in the middle waters where shipping would be and thins at both ends. Straight
"denser the further out" made the Ancient Deep the busiest water on the chart, which is
backwards for the one place meant to feel lonely. What climbs monotonically with depth is
how GOOD the deals are.

They look like players because they are built from the real cosmetic tables (hulls,
bandanas, colours, plain rods) — so anything that ships for players appears out here the
same day. Glowing rods are excluded: those are things people earned.

## The five kinds

| Kind | What it does |
|---|---|
| **Bait peddler** | Sells a bundle of common bait, 25–48% under shop. |
| **Salter** | Buys your whole hold, 74–86% of market. |
| **Deep tinker** | Better bait, bigger discount. Only past the halfway mark of the chart. |
| **Talker** | Says one thing and wants nothing. ~22% of everyone. |
| **Blockade runner** | Night + deep water only. Carries the three shop-banned rods. |
| **Resident buyer** | Permanent, one per zone. See below. |

## Nobody sails through stone

Placement has always had guards, and every one of them was about the **edges** of the
world: inside the outer ring, south of the reef, off the Mainland's doorstep. Nothing
tested the things standing in the **middle** of it, so traders anchored inside islands and
their patrols carried them across ports. A captain watched one sail through the Trawl
Docks.

`web/lib/seaSolid.ts` is the one model of what is solid — ports, isles, landmarks — and
`traderAt` and `runnerAt` both refuse an anchor whose whole patrol is not clear of it. The
pad is `MAX_DRIFT + BOAT_CLEAR`: the widest patrol anyone can roll, plus half a hull,
because an anchor that clears a rock is worthless if the swing puts the boat back in it.
Deliberately conservative — over-clearing costs one trader in a cell that had a rock in it,
under-clearing costs a boat sailing through stone.

A cell with nothing clear in it has nobody, the same way every other guard fails: the
population is probabilistic, so a refusal reads as empty water rather than a hole.

**`scripts/check-traders.mts` asserts it**, sampling 180 points around every patrol across
six days and the whole clock (the runners only exist at night, and they are generated on
their own path — the one that had missed every guard the day traders got). It also asserts
the sea is not EMPTY, because a clearance test that refuses every cell would pass the first
rule perfectly. Verified by removing the guard: 22 boats through solid ground, including
the Trawl Docks.

Finn keeps his own list and does not use this one. His clearances are hail circles, not
hulls — he must not stand where his prompt would fight a port's, so his radii are far
larger than anything physical. They are also load-bearing in a way these are not: his
position is a pure function of how many times you have met him, so changing a radius moves
him for every captain mid-story.

---

## The Salt Road panel

`FolkPanel.tsx`, behind a HUD button (two figures, slot 4). It exists for one reason:
**the fishing campaign is told one meeting at a time by a man you have to go and find, and
nothing on the chart said so.** A captain who had met Finn twice had no way to learn that a
third meeting would say something new.

- **Finn is the headline** and gets the gold: times met, how much of his story you have
  heard (`seenBeats` counted against `FINN_ENCOUNTER_BEATS`, 13), wagers won and their own
  beat track (16), and where he was last seen. The button carries an **amber dot whenever a
  beat is waiting** — which, since `findNextEncounterBeat` walks the unseen list rather than
  gating on a milestone, is true until he runs out of things to say. The `milestone` field
  on a beat is vestigial; do not reintroduce it as a gate without changing this panel.
- **The named folk are a roster, not a log.** Finn, the five zone buyers and Yoon are
  permanent and always in the same water, so they are listed and gated by band level. Locked
  rows withhold the name and say which water and what level.
- **The wanderers get a legend, not rows.** They are hashed out of (cell, day) and gone at
  midnight, so "who have I met" has no honest answer for them. What the panel gives instead
  is what the five kinds want when you pull alongside, because "salter" was never explained
  anywhere.

If per-person "met" tracking is ever wanted for the residents and Yoon, that is a `text[]`
on profiles written at hail time. It was deliberately NOT built here: it buys a tick beside
six names and the panel's job is the Finn loop.

## Finn is not on the Salt Road

He is the campaign's rival (see [story-universe.md](story-universe.md), and read it before
writing him a line — the whole arc hangs on what he does not say yet). Code:
`web/lib/seaFinn.ts` for where he is, `web/app/(app)/sea/finnActions.ts` for everything
that happens when you get there.

**Found, not rolled.** He used to be a 2% chance on every cast. Now he stands on the chart
and you sail to him. One meeting, one story beat, and the next one is somewhere else — his
position is a pure function of `profiles.finn_encounters`, so "he disappears after you talk
to him" needs no column and no cleanup. The count goes up and the old spot is empty water.

Same derived law as the traders, with one difference: his haunt is per-CAPTAIN, not per-
cell-per-day. He belongs to the story rather than the world, and two boats on the same wave
are at different points in it.

- **Where.** Low-discrepancy strides over the southern fan, capped to bands you have
  unlocked and biased deep. Consecutive haunts are forced apart (shortest measured hop
  2,485px, 1.6x the hail circle) and he never overlaps anything that owns a button.
  `scripts/check-finn.mts` asserts both on every build — it exists because the first cut
  gave landmarks too wide a keep-out and sealed the Shallows to **0.0% standing room**
  without anything looking wrong.
- **The Shallows is excluded** once you have any other water. It holds all four ports and
  is 3.7% clear, and a rival loitering off the end of your own dock is not one you have to
  go and find.
- **Findable.** A named compass arrow and an amber ring on the minimap. The point was never
  to hide him, it was to make you sail.

### His bets are server-owned, and that is new

The fishing-screen settlement took the verdict AND the payout as arguments:

```
settleFinnChallenge(won: boolean, rewardDoubloons: number, ...)
newGold = doubloons + (won ? Math.floor(rewardDoubloons) : 0)
```

Anyone with a console could mint doubloons. Survivable while the sea was two admins on an
allowlist; not survivable with the chart open. The bet now lives in
`profiles.finn_challenge` (written only by the server, so the tier and multiplier are never
in the client's gift) and is settled against counters `reelIn` already maintains:

| Bet | Measured against |
|---|---|
| `perfect_streak` | `current_perfect_streak` **and** a `total_perfects` delta |
| `speed_catch` | `sum(fish_lifetime.catches)`, snapshotted at accept, plus the deadline |

No change to the cast path — those numbers were already being written and had nobody
reading them. The `total_perfects` delta is not redundant: the streak survives taking the
bet, so a captain sitting on a run of nine would otherwise win "three in a row" without
casting.

Offers come at ~45% of meetings, never stacked on a running bet, and an EXPIRED speed bet
stops counting as running — otherwise closing the tab mid-bet would block every future
offer for the life of the account.

## The three sell lanes

This is the shape the economy is moving toward, and the resident buyers are the middle rung:

| Lane | Pays | Costs you |
|---|---|---|
| Market ashore | 100% | Sail home, wait for settlement |
| **Zone buyer** | **78–86%** | Nothing — it is in the water you are fishing |
| Quick sell | 65% | Nothing, anywhere |

The rate climbs with depth because the sail home is longer. Residents are defined on the
chart (`chart.ts`, `resident`), are the same person every time, swing on an anchor rather
than patrolling, and are **deliberately outside the daily deal cap** — selling your own
catch is not a reward you can farm, it is the conversion quick-sell already does without
limit. Capping it would only ever strand somebody with a full hold.

## Guards

- **Once per trader** — primary key on `(user_id, trader_key)` in `sea_trader_deals`. The
  INSERT is the claim, so two taps cannot both win.
- **Six deals a day** (`DEALS_PER_DAY`) — the real bound on the feature. The map is
  client-side, so the server cannot check you sailed anywhere. Rather than pretend
  otherwise, the cap makes it not matter.
- Residents are exempt from both.

`deduct_doubloons(uid, amount)` — note the argument names, and note it does its balance
check inside its own WHERE and **returns NULL rather than raising**. Guarding on `error`
grants the goods for free.

Every action returns the new balance and the panel dispatches **`doubloons-changed`** — the
header reads its total once at render and never asks again, so without it a sale looks like
it did nothing. The detail must be a number or Nav crashes on `null.toLocaleString()`.

## The sea's own day

`CYCLE_MS = 48 minutes` for everybody, on the same tick worldwide — night comes round about
three times an hour. Terraria's instinct (gate the rarest merchants on darkness) is right,
but gating on the PLAYER'S clock means a wrong timezone never sees half the content, which
this game does not do.

Derived from the wall clock, so client and server agree without storing anything. Night is
applied to the colour BLEND, not as a sheet over it — a dark overlay flattens everything
into one grey, where pulling the palette down keeps the Shallows lighter than the Abyss
after dark.

`nightIndex` deliberately does not change mid-night, or a trader would vanish
mid-conversation. A runner's key carries it, so an offer cannot be redeemed a cycle later.

## The trader-only rods

`traderOnly` on a rod means the tackle shop will not list it, `buyRod` refuses it, and the
"next to save for" line skips it. Currently the **YOLO, Galaxy and Lightsaber**.

**Before moving another rod here, check it is not the sole source of an effect at its
maximum.** Nine of the ten high-tier rods are — they are Completionist donors, so gating one
puts that build behind finding a rare NPC. The runners are deliberately common inside their
window for exactly this reason: the build should be an exploration problem, not a lottery.

## Talkers pay nothing

Mixed evenly between a hint you can act on and a fragment of the arc. No reward, ever — the
moment a talker pays out, everybody sails the row of them every night and it becomes a
chore, which is the failure this game refuses everywhere else.


## How many people are actually out there

There is no spawn table — everyone is derived from `(cell, day)` by a hash — so the only
honest way to answer this is to walk every cell the hull can reach. `web/scripts/count-sea-npcs.mts`
does that (`npx tsx scripts/count-sea-npcs.mts`). Re-run it after any change to `occupancy`,
`CELL`, the chart's radius or the north wall.

Measured over 60 days, chart radius 22600, south of `NORTH_WALL`:

| | |
|---|---|
| Wanderers by daylight | 24–44, **average 34** |
| Wanderers after dark | 58–89, **average 76** |
| Night adds | **42**, all of them blockade runners carrying a trader-only rod |
| Talkers | ~13 a day, **37%** of the daytime sea (the `isTalker` roll is 0.4) |
| Resident buyers | **5** — permanent, one per band, not part of the roll |

So roughly **39 people on the water by day and 81 after dark**, of whom 5 are always in the
same place. Nobody is repeated: the hash makes a cell's occupant unique to that cell and day.

### Talkers carry the game's mechanics now

The fishing screen filled the seconds between cast and bite with tips, and that was doing
real work — nearly everything in this game is discoverable only by being told, and that is
where players were told. The map has no such gap (you are steering), so the knowledge moved
onto the water and into the mouths of people standing in it.

- **`isTalker` is 0.4**, up from 0.22. At a fifth you could sail a whole band without meeting
  one, which is far too narrow a channel to put the game's mechanics through. Still not most
  of them — a sea where nobody trades is not a Salt Road.
- **`HINTS` is 36 lines**, the fishing screen's tip pool rewritten as things a person would
  say. Never "Tip:", never a figure the player cannot check. **Verify any number against the
  source before adding one** — a stale hint is worse than none, and out here it is also a
  person lying to you.
- **A talker carries a RUN of 4 distinct lines, not one**, and the panel's "Go on" walks it.
  `runOf()` steps the pool by a stride coprime with its length, so it visits every index
  before repeating any — four calls to `pick()` would have repeated. The topic split is
  weighted 62/38 toward hints over stories.
- The run is derived from the same stream as everything else about them, so a given person
  always knows the same things and always says them in the same order.

Verified over 40 days: 283 talkers of 769 traders (37%), zero runs containing a repeat, zero
runs short of four, all 44 lines reachable.

**The doorstep exclusion is derived, not a constant.** `MAINLAND_DOORSTEP` is the Mainland's
mooring ring plus a boat length. It was hard-coded at 620, tuned when the island had a radius
of 250; when the island grew its ring reached further and the old number left wanderers
bobbing inside the harbour approach with the go-ashore prompt already up.


## The sea's day (`lib/seaClock.ts`)

**A full cycle is 48 minutes**, derived from the wall clock so every player worldwide is in
the same phase at the same instant. Four phases:

| phase | glyph | length | share |
|---|---|---|---|
| day | sun | 11.7m per run, twice | 49% |
| dusk | setting sun | 4.3m | 9% |
| night | crescent | 16.0m unbroken | 33% |
| dawn | rising sun | 4.3m | 9% |

**It ran at 24 and the light was never still** — a run of daylight lasted under six minutes,
so the sky was changing colour for most of any session and dusk arrived while you were still
deciding what to do about the last one. A day you notice turning is atmosphere; a day that
turns while you cross one band is a strobe with a long period. Doubled, night is a condition
you fish *in* rather than a state that keeps interrupting, and the worst wait for one is
still under twelve minutes.

The rare-trader window is `isNight`, which counts **dusk as well as night** — 20.3m of the
48, or 42% — because somebody arriving as the light goes should not be told to come back in
ninety seconds. Night sits in the middle of the cycle rather than across the wrap, so
`nightIndex` cannot tick over mid-night and strand you talking to a runner who no longer
exists.

**The chart shows a SYMBOL, not the name.** A name in the corner is a label on a map, and the
sky already says what time it is in colour — the corner only confirms it at a glance.
`PHASE_GLYPH` lives beside the phases so a new one cannot be added without a shape; the label
survives as `title` and `aria-label`. Dusk and dawn are the same half-disc mirrored, one
sinking and one climbing, because that is the only pair colour alone could not separate.


## Yoon — the one NPC who is not generated

Everyone else on this sea comes out of a hash: a name, a boat and an offer derived from a
cell and a day. That is the right way to fill an ocean and exactly the wrong way to make one
person matter. **Yoon is written down** (`YOON` in `chart.ts`, built by `yoonTrader()`).

- **Permanent**, like the zone buyers and unlike the wanderers. A one-of-a-kind rod behind a
  trader who might not be there today is not a destination, it is a slot machine.
- **Moored in the Ancient Deep** at (13820, 9880) — R=16,988, inside the 16,000–22,600 band,
  986px clear of every solid landmark. That is the water his rod is for: tier 20 asks Fishing
  75 and so does the band. About 55 seconds' sail from the dock on a stock hull.
- **`Yoon's Locked-In Rod` is now `traderOnly`**, so it leaves the tackle shop catalogue
  entirely. A rod named after somebody that you buy off a shelf is just a rod with a name on
  it. The 350,000 is unchanged — the cost of that rod was never the money.
- **Outside the daily deal cap.** The cap bounds a daily rotation of wanderers; Yoon sells one
  thing, once ever, and you cannot own the rod twice. Capping him would only ever make
  somebody burn a day's trading to discover they were one deal short of a rod they had just
  sailed an hour for.
- `traderFromKey('yoon')` returns him **without consulting the clock** — a runner's key
  carries the night it belongs to and expires with it; his never goes stale.

`yoonTrader()` is one function called by both the map (to draw him) and the server (to price
him), so the two cannot disagree about what he is selling or what he wants for it.
