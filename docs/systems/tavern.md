# Tavern — Casino & Minigames

Blackjack, roulette, Fish Slots, Crown & Anchor, Tide Run, contests, plus the doors to
trivia and the Chart Room. The play-money corner: fun first, economy tightly capped.

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
