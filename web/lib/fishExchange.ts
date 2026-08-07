// THE EXCHANGE, what is left of it.
//
// This file used to BE the Exchange: fund definitions, leverage tables, quoting,
// theta, settlement, all priced off the fish sell market. That engine is gone.
// The board now runs on its own free-floating indexes, and the pricing lives in
// lib/exchangeBoard.ts with the actions in tavern/market/boardActions.ts.
//
// Two constants survived because the rest of the game asks about the Exchange
// without needing to know how it prices anything. Everything else was deleted
// with the tables it read from.

/** WHAT FISHING LEVEL OPENS THE BOARD.
 *
 *  Navigation used to be half the requirement, on the reasoning that the
 *  Exchange should ask for both halves of the game. But every read that makes
 *  you money here is a read about the water, so asking a captain to grind
 *  voyages for it taxed the wrong skill.
 *
 *  100 is MAX_LEVEL, so this is the last thing fishing gives you: the board
 *  stops being a price list and starts being something you can take a position
 *  on. */
export const EXCHANGE_FISHING_LEVEL = 100

/** THE BOARD IS SHUT.
 *
 *  Kept as a switch rather than deleted, because a market you cannot close is a
 *  market you cannot fix. Flip to true and the board stops taking new bets while
 *  everything already open still settles on its agreed terms.
 *
 *  False since the rebuilt board shipped. */
export const EXCHANGE_UNDER_CONSTRUCTION = false
