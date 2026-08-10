-- Real-money gem purchases: exactly-once fulfilment.  APPLIED 2026-08-10.
--
-- The membership grant gets idempotency for free by being a boolean — setting
-- is_premium=true twice is harmless. Gems do not. Stripe retries a webhook until
-- it gets a 2xx, and Apple replays unfinished transactions, so the same purchase
-- can arrive several times and a naive handler pays out on each one.
--
-- The LEDGER ROW is the lock. payment_ref holds the Stripe checkout session id
-- (or, later, the Apple transaction id) and is UNIQUE, so the first delivery
-- inserts and every later delivery loses that insert and grants nothing.
--
-- PARTIAL index, because every existing row and every in-game gem award has no
-- payment reference and must stay free to repeat — a player can win the daily
-- bonus every day and those rows are identical apart from the timestamp.
--
-- Order matters in the handler: insert the ledger row BEFORE moving the
-- balance. A crash between the two leaves a recorded purchase and no gems,
-- which is a support ticket; the other order leaves gems nobody can account
-- for, which is a hole in the economy.
--
-- Verified on the live database before shipping: first delivery granted 1 row,
-- an identical retry granted 0, and two unreferenced in-game awards both
-- inserted normally.

alter table public.gem_transactions
  add column if not exists payment_ref text;

create unique index if not exists gem_transactions_payment_ref_key
  on public.gem_transactions (payment_ref)
  where payment_ref is not null;

comment on column public.gem_transactions.payment_ref is
  'Stripe session id / Apple transaction id for a paid gem purchase. UNIQUE — it is what makes fulfilment exactly-once.';
