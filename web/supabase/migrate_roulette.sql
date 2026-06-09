-- Fish Roulette. European single-zero wheel (37 pockets: 0-36) reskinned
-- with fish — 1-12 shallows, 13-24 open waters, 25-36 deep, 0 = the
-- Abyss (house's pocket). Mirrors the blackjack pattern: doubloons buy
-- chips, chips churn freely on the table, cash-out converts back.
--
-- Chips column lives on profiles (one row per player) so it's the single
-- source of truth. Spins are atomic: server reads chips, validates bets,
-- rolls, settles, writes one roulette_spins row + updates chips, all in
-- the same action. No separate "active spin" table because roulette
-- doesn't have mid-game decisions like blackjack does (hit/stand) — the
-- whole bet → spin → settle cycle is one server action.

-- ── Profile columns ──
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS roulette_chips int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS roulette_session_buy_ins int NOT NULL DEFAULT 0;

-- ── Daily buy-in log (drives the daily cap) ──
CREATE TABLE IF NOT EXISTS roulette_buy_ins (
  id          bigserial PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount      int NOT NULL CHECK (amount > 0),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS roulette_buy_ins_user_day_idx
  ON roulette_buy_ins (user_id, created_at DESC);

ALTER TABLE roulette_buy_ins ENABLE ROW LEVEL SECURITY;
-- No policies — service-role only (server actions read/write via admin
-- client). authenticated/anon have no SELECT/INSERT path.

-- ── Spin log (audit + recent-spins strip) ──
--
-- bets jsonb shape:  [{ type, target, amount }]
--   type   — 'straight' | 'dozen' | 'column' | 'color' | 'parity' | 'half'
--   target — number (straight 0-36, dozen 1|2|3, column 1|2|3),
--            string ('red'|'black' for color, 'even'|'odd' for parity,
--            'low'|'high' for half)
--   amount — chip count for that bet
--
-- net_chips = (chips_after - chips_before). Negative = net loss for the
-- spin, positive = net win.
CREATE TABLE IF NOT EXISTS roulette_spins (
  id              bigserial PRIMARY KEY,
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  bets            jsonb NOT NULL,
  winning_number  int NOT NULL CHECK (winning_number BETWEEN 0 AND 36),
  total_wagered   int NOT NULL CHECK (total_wagered > 0),
  total_payout    int NOT NULL CHECK (total_payout >= 0),
  net_chips       int NOT NULL,
  chips_before    int NOT NULL,
  chips_after     int NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS roulette_spins_user_recent_idx
  ON roulette_spins (user_id, created_at DESC);

ALTER TABLE roulette_spins ENABLE ROW LEVEL SECURITY;
-- Service-role only — clients hit /tavern/roulette server actions, which
-- pull spin history via the admin client.
