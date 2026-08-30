# Tavern — the social room

**What the tavern IS: the room with other people in it.** Who is on the water right now,
who you follow, and who you have agreed to sail with — plus the day's tot and whatever
race is running, collected on the way through.

It was a lobby, then a cupboard. The Den, the Chart Room, the Parlor and the Market all
became buildings in the Mainland town that open straight off the water, and `/sea` took
the startup slot, so what was left was a ticker, a login bonus, a contests card and one
arcade game that was only there because it had nowhere else to go — a leftovers page
holding one of four tabs on a phone.

**Why social and not something else.** The tavern is the only building whose fiction IS a
room with people in it, and social was the most scattered system in the game: the follow
list on its own page behind a menu, sailing pacts in a panel on the chart, leaderboards a
tab, contests a card in here, profiles somewhere else again. Six surfaces and no room.

## Four groups, and none of them is a list

The first cut was five unlabelled cards at the same visual weight, two of which were full
lists (every captain you follow, and the whole pact board). That is not a room, it is a
filing cabinet with a fireplace.

| Group | What it holds |
|---|---|
| **Overheard** | the room talking: 81 snatches of conversation, hints and pure talk |
| **Your crew** | counts, a row of faces, anyone waiting on an answer → `/social` |
| **The Salt Road** | where you stand with the nine, read-only, top three only |
| **The day** | the tot, the races, Tide Run — everything that resets, and it is LAST |

**The rule: the tavern says how things STAND and links to where they are MANAGED.** The
full follow list and the full pact board live on `/social`, which kept its page and lost
its nav entries — the tavern's Crew group is the one door in. A digest with a way through
beats a list every time on a page that is meant to be a room.

**Anything waiting on an answer breaks the digest rule on purpose.** A pact request is a
person, it goes stale, and burying it behind a count is how one sits unanswered for a
week. It gets its own line and its own colour.

## Design rules

- **GOSSIP IS HOW THIS GAME TEACHES ITSELF.** `lib/tavernGossip.ts`. The game has a forge,
  a bunkhouse, weekly puzzles and a man in the deepest water selling a rod no shop stocks,
  and none of them announce themselves. The obvious fix is a hints panel; a hints panel is
  a manual, and it tells a player the game is a system rather than a place. A half caught
  sentence at the next table is the same information wearing clothes. Six rules govern the
  lines and they are written at the top of that file: **nobody is talking to you** (no
  second person, no instructions), **every factual line is true** (vague is allowed, wrong
  is not), **no numbers that live in code** (they get retuned and the line would not move
  with them), **about a third carry nothing at all** (a room where every sentence is useful
  is a briefing), **the nine regulars are subjects and never speakers** (they keep to the
  water, which is the whole reason they are worth sailing to), and no em dashes. The lines
  are in `check-copy.mts` so the last one is enforced.
- **A PRESENCE WALL SHIPPED HERE FIRST AND WAS REPLACED.** It named the captains currently
  at sea, off `sea_seen_at`. It worked; it was thin. On a small roster it was usually empty,
  and even full it only said that other people existed. If it ever comes back, the rule it
  ran on is worth keeping: presence is not position. Live position stays the Captain +
  accepted-pact perk the chart enforces in Postgres; a mutual follow was the floor for the
  weaker claim, and everyone else was counted, never named.
- **The old presence rule, for reference.** The chart answers where a captain
  is, live, and gates it hard: both hold a membership AND have agreed a pact, enforced in
  Postgres, because following somebody back is not consent to be tracked. The tavern
  answers the weaker question and takes the weaker permission — a **mutual follow**, which
  is the same floor the pact system needs before it will even offer to ask. No membership,
  because an empty room is not a perk worth selling.
- **Everyone else is counted, never named.** "And fourteen other captains on the water"
  makes the room feel like a place without publishing a list of who is playing right now
  to anyone who asks.
- **`sea_seen_at`, never `last_seen_at`** for any live-presence work anywhere. The latter is
  stamped ONCE per app load for the admin dashboard, so a short window against it shows an
  empty room full of people. `sea_seen_at` is a real heartbeat, flushed every 20s while on
  the chart, and it counts captains ON THE WATER rather than in a menu.
- **The pact board is shared, not copied** (`components/PactBoard.tsx`). The chart's
  overlay and the tavern render the same component; two implementations of
  accept/withdraw/part-ways would drift and then disagree about a relationship inside one
  game.
- **`/social` is still a page** — the full follow list, the search and the whole pact
  board — but it has no nav entry: the tavern's Crew group is the only door in. Two links
  to two halves of the same thing is the arrangement this change was undoing.
- **The Salt Road digest is READ-ONLY and stays that way.** Three faces and two counts. No
  talking, no gifts, no tapping through: rapport moves by pulling alongside somebody on
  the water, and the moment it can be worked from a menu, sailing out to find Meg stops
  being the point of Meg. `components/SaltRoadCards.tsx` is the one card implementation,
  shared with the chart's own panel.
- **First-run setup does NOT live here any more.** `SetupModal` / `WelcomeModal` hang off
  `app/(app)/layout.tsx`. They were mounted on this page back when it was where a new
  captain landed; once `/sea` took the startup slot that meant nobody was ever asked to
  choose a name or a face.

## The casino is elsewhere

Blackjack, roulette, Fish Slots and Crown & Anchor live behind **the Den**, its own
building on the Mainland. The rules below still govern them.

## Files

`web/app/(app)/tavern/` — one subdirectory per game, hub cards at the top level.
Libs: `web/lib/blackjack.ts`, `web/lib/roulette.ts`; slots RTP checker at repo root
(`slots-rtp.mjs`). Fairness writeup: `BLACKJACK_FAIRNESS.md` (repo root).

## The wallet (the rule that protects the whole economy)

**ONE shared chip purse** across all casino games, with a daily buy-in cap
(`tavern/casino/actions.ts`). Chips are not doubloons; the cap is what lets the games
pay generously without becoming a doubloon printer. Any new casino game MUST draw from
this purse — never its own balance, never doubloons directly.

## Per-game laws

- **Blackjack**: `leaderboard_blackjack` is a VIEW, not a table — don't insert into it.
  Fairness rules (shoe, shuffle, payout) documented in `BLACKJACK_FAIRNESS.md`.
- **Crown & Anchor payout is `wager * (matches + 1)`** — returning the stake plus
  winnings. `wager * matches` shipped once and silently confiscated stakes.
- **Fish Slots**: pay table tuned against the RTP script; the Catfish Jackpot is a
  long-odds side pot. Retune with `slots-rtp.mjs`, not by eye.
- **Tide Run**: canvas endless runner (`tavern/tide-run/TideRunGame.tsx` is the spec —
  constants at the top). Hazard sweeps must gate by VIEWPORT with lookahead spawn, or
  fast runs outrun the spawner. Native iOS port brief: `ios/PORT_BRIEF.md`.
- **Contests** ("first to X" races): the winner is decided atomically via a primary-key
  insert — first insert wins, everyone else conflicts. Don't replace with read-check.

## Connects to

- [trivia.md](trivia.md), [chart-room.md](chart-room.md) — separate systems behind
  tavern doors. [fish-economy.md](fish-economy.md) — the Exchange ticker lives here too.
