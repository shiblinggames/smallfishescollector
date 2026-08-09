# Fish Economy — Market, Liquidation, The Exchange

How caught fish become doubloons, and the leveraged casino on top.

## The market and the three sell lanes

`web/lib/fishMarket.ts` + hold actions in `web/app/(app)/fishing/holdActions.ts`.

- **Quick-sell pays a deliberate haircut (65%) and must never be removed.** The two-lane
  design (instant at a discount vs delayed at full price) is the whole tension. Players
  asked why; the answer is in the lane, not a bug.
- **Delayed liquidation** books a `pending_sales` row and settles later with a toast.
  Three lanes total: quick-sell, delayed full-price, and market-order variants. When
  touching settlement, check all three — they share the pending machinery.

## The Exchange

Leveraged option contracts on fish-price indexes. Gated behind high fishing level.
Pricing core: `web/lib/exchangeBoard.ts`. Legacy engine parts: `web/lib/fishExchange.ts`.

Design constraints learned the hard way (each was a live exploit or mispricing):

- **The engine accumulates in LOG space.** Any pricing formula comparing raw percent
  moves against it is wrong (down is not the mirror of up). Convert first.
- **Game time ≠ calendar time.** The board ticks 24/7; volatility and jump frequency are
  calibrated to the game's compressed timeline, not real market hours. Do not "correct"
  the calibration toward real-world annualization — that was a bug we shipped once.
- **Engine and pricing must gain features in the SAME commit.** Adding jumps to the
  engine without pricing them (or vice versa) is an open tap for players.
- **Breakeven = strike + premium/lot**, per-contract premium divided by lot size. Omitting
  the lot made chance-of-profit read ~0 board-wide (found by a player who trades options).
- **Lot sizing uses sqrt damping** so expensive indexes still FEEL expensive while cheap
  ones stay tradeable. Preserve price ordering when retuning.
- Verify any pricing change with a simulation comparing priced chance vs realized rate
  across every offered bet, worst-EV tracked. The gate scripts from past sessions are the
  pattern to copy.

Status: the free-floating-index rebuild sits behind a flag with UI still to build.

## Connects to

- [fishing.md](fishing.md) — supply side. [tavern.md](tavern.md) — the Exchange lives in
  the tavern's market corner. [economy-membership.md](economy-membership.md) — ledgers.
