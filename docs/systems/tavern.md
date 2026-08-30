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

**Order on the page: the room, the door, the handshake.** Who is here → who you know →
what you have agreed. Everything that resets sits underneath, because it is collected on
the way past rather than the reason to come.

## Design rules

- **PRESENCE IS NOT POSITION, and that is the line.** The chart answers where a captain
  is, live, and gates it hard: both hold a membership AND have agreed a pact, enforced in
  Postgres, because following somebody back is not consent to be tracked. The tavern
  answers the weaker question and takes the weaker permission — a **mutual follow**, which
  is the same floor the pact system needs before it will even offer to ask. No membership,
  because an empty room is not a perk worth selling.
- **Everyone else is counted, never named.** "And fourteen other captains on the water"
  makes the room feel like a place without publishing a list of who is playing right now
  to anyone who asks.
- **`sea_seen_at`, not `last_seen_at`.** The latter is stamped ONCE per app load for the
  admin dashboard, so a five-minute window against it shows an empty room full of people.
  `sea_seen_at` is a real heartbeat, flushed every 20s while on the chart. The honest
  consequence: this counts captains ON THE WATER, not in a menu.
- **The pact board is shared, not copied** (`components/PactBoard.tsx`). The chart's
  overlay and the tavern render the same component; two implementations of
  accept/withdraw/part-ways would drift and then disagree about a relationship inside one
  game.
- **`/social` redirects here** and its nav entries are gone. The components stay in
  `app/(app)/social/` and are imported by the tavern.
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
