-- The Exchange: unlock announcement + lifetime ledger.
-- Applied 2026-08-06. Companion to migrate_fish_exchange.sql and
-- migrate_exchange_contracts.sql.

-- ── 1. The one-time unlock announcement ──────────────────────────────────────
--
-- The Exchange now opens at Fishing 100, the level cap, so arriving there is a
-- milestone rather than a tab that quietly stops being greyed out. This drives
-- the announcement and the guide behind it.
--
-- A column and not localStorage: house convention for every tour flag
-- (has_seen_market_intro, has_seen_fishing_hub_tour, ...), so it survives a
-- reinstall and follows the account across devices.
alter table public.profiles
  add column if not exists has_seen_exchange_intro boolean not null default false;


-- ── 2. The lifetime ledger ───────────────────────────────────────────────────
--
-- What a captain has ever put in and ever taken out.
--
-- The Exchange stakes straight from the main purse rather than from a brokerage
-- balance you top up, because contracts settle on a cron hours after you close
-- the app: a second purse would mean every settlement lands somewhere you have
-- to remember to go and collect. The cost of one purse is that the balance can
-- no longer tell you how you are DOING, since doubloons arrive from fishing,
-- raids and gauntlets all day. This is that answer, kept without the wallet.
--
-- Aggregated here rather than summed in the client because the board only loads
-- the 60 most recent positions, so a client-side total would silently start
-- under-reporting at the 61st contract.
--
-- Open positions are excluded on purpose. Their money is neither staked-and-lost
-- nor returned yet, and folding a live contract's paper value into a lifetime
-- total would make the number move every hour for reasons that have nothing to
-- do with what has actually been banked.
create or replace function public.exchange_lifetime(uid uuid)
returns table (staked bigint, returned bigint, contracts int, paid int)
language sql
stable
security definer
set search_path = public
as $$
  select
    coalesce(sum(stake), 0)::bigint,
    coalesce(sum(coalesce(payout, 0)), 0)::bigint,
    count(*)::int,
    -- "paid" means it came back worth MORE than it cost. A contract that
    -- returned something but less than the stake is still a loss.
    count(*) filter (where coalesce(payout, 0) > stake)::int
  from exchange_positions
  where user_id = uid
    and status <> 'open'
$$;

-- Service-role only, per the house convention for every SECURITY DEFINER
-- function: it takes a uid argument, so a signed-in caller could otherwise read
-- any other captain's trading history.
revoke all on function public.exchange_lifetime(uuid) from public, anon, authenticated;
grant execute on function public.exchange_lifetime(uuid) to service_role;
