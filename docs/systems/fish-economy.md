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

The rebuilt free-floating-index board is live: `web/app/(app)/tavern/market/`
(`BoardClient.tsx`, `boardActions.ts`).

## Connects to

- [fishing.md](fishing.md) — supply side. [tavern.md](tavern.md) — the Exchange lives in
  the tavern's market corner. [economy-membership.md](economy-membership.md) — ledgers.


## The sell lanes ladder on DISTANCE (2026-08-26)

| lane | pays | where | wait |
|---|---|---|---|
| Quick-sell | 75% (100% on Full Moon) | anywhere, without moving | none |
| Zone buyer | 78–86%, deeper pays more | where you are fishing, if you sail to them | none |
| The market | **100%**, less the 3% non-Captain fee | ashore at the Mainland | none |

**The 1-hour delayed liquidate at ~87% is retired.** `liquidateAllFish` became
`sellEntireHold`: instant, full market price, no `pending_sales` row, and the lane is gone
from the fishing screen entirely.

The hour was standing in for a cost. The market lane was meant to be the one you work for,
and holding the money back was the only way to charge for that on a screen openable from
anywhere. The ocean hub charges it properly now — the market is a building on an island and
reaching it means sailing home with a full hold, which is a real trip with a real decision in
it. Taking another hour on top is charging twice for the same thing.

**Selling the lot pays exactly what selling one at a time pays**, so the one-tap button can
never be the worse choice — it *is* the per-species market, in one tap instead of thirty.

`settlePendingSales` and the `pending_sales` table **stay and still run**: there are rows in
the wild with an hour left on them and they have to be honoured. Nothing new is written there.
