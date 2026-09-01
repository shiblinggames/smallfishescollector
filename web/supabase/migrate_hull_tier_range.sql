-- ── THE HULL LADDER OUTGREW ITS CHECK ───────────────────────────────────────
--
-- `profiles_hull_speed_tier_range` was written when the hull had four rungs:
--
--   CHECK (hull_speed_tier >= 0 AND hull_speed_tier <= 3)
--
-- The ladder grew to six (HULL_SPEED in lib/shipyard has six entries, so
-- MAX_HULL_TIER is 5) and the constraint never grew with it. So Postgres
-- rejected every refit past tier 3 — while `spend()` had ALREADY taken the
-- money, because the charge happens before the write.
--
-- Nothing noticed because the update's error was never read. Same swallowed
-- failure as the golden mount two days ago, same shape, different table: a
-- write whose result nobody looks at, guarded by a constraint nobody updated.
--
-- Between them two captains paid sixteen times for refits that never landed.
--
-- 5 rather than a number typed in again: it is MAX_HULL_TIER, and the whole
-- fault here was a bound in the database drifting from the bound in the code.
alter table profiles drop constraint profiles_hull_speed_tier_range;
alter table profiles add constraint profiles_hull_speed_tier_range
  check (hull_speed_tier >= 0 and hull_speed_tier <= 5);

-- ── AND THE MONEY THAT BOUGHT NOTHING ───────────────────────────────────────
--
-- Every `Shipyard: hull tier N` charge where the tier never moved. Credited
-- back rather than granting the tiers: the player paid for a refit and did not
-- get it, so the honest unwind is the coin, and they can buy it again now that
-- buying works.
--
-- Keyed on the ledger, so it refunds exactly what was taken and cannot pay out
-- twice if this file is run again — the second run finds the refund rows and
-- nets them against the charges.
with lost as (
  select t.user_id, sum(-t.amount) as owed
  from doubloon_transactions t
  where t.reason like 'Shipyard: hull tier %'
    and substring(t.reason from 'tier ([0-9]+)')::int
        > (select p.hull_speed_tier from profiles p where p.id = t.user_id)
  group by t.user_id
),
already as (
  select user_id, sum(amount) as paid
  from doubloon_transactions
  where reason = 'Refund: hull refits that never landed'
  group by user_id
),
due as (
  select l.user_id, l.owed - coalesce(a.paid, 0) as amount
  from lost l left join already a on a.user_id = l.user_id
  where l.owed - coalesce(a.paid, 0) > 0
)
insert into doubloon_transactions (user_id, amount, reason)
select user_id, amount, 'Refund: hull refits that never landed' from due;

update profiles p
set doubloons = p.doubloons + d.amount
from (
  select t.user_id, t.amount
  from doubloon_transactions t
  where t.reason = 'Refund: hull refits that never landed'
    and t.created_at > now() - interval '1 minute'
) d
where p.id = d.user_id;
