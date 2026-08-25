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

`CYCLE_MS = 24 minutes` for everybody, on the same tick worldwide — night comes round about
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

Measured over 60 days, chart radius 14400, south of `NORTH_WALL`:

| | |
|---|---|
| Wanderers by daylight | 10–29, **average 19** |
| Wanderers after dark | 23–49, **average 37** |
| Night adds | **17**, all of them blockade runners carrying a trader-only rod |
| Talkers | ~4 a day, **21%** of the daytime sea (the `isTalker` roll is 0.22) |
| Resident buyers | **5** — permanent, one per band, not part of the roll |

So roughly **24 people on the water by day and 42 after dark**, of whom 5 are always in the
same place. Nobody is repeated: the hash makes a cell's occupant unique to that cell and day.

**The doorstep exclusion is derived, not a constant.** `MAINLAND_DOORSTEP` is the Mainland's
mooring ring plus a boat length. It was hard-coded at 620, tuned when the island had a radius
of 250; when the island grew to 440 its ring reached 860 and the old number left wanderers
bobbing inside the harbour approach with the go-ashore prompt already up.
